"""Voting helpers shared by Majority, Ranked-Choice, and Robert's
Rules decision methods.

Three pieces live here:

  * `extract_candidate_options(...)`: takes a list of finalized
    position texts, asks the orchestrator LLM to cluster them into a
    small set of distinct option labels, returns them as a list of
    short strings.

  * `cast_vote(...)`: asks one participant to vote on a list of
    options (or to rank them, depending on `mode`), returning a
    structured dict.

  * `run_irv(...)`: instant-runoff tally for ranked-choice ballots.

All three are pure helpers (no Session mutation) so the decision
method classes can compose them however they want.
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import Any, AsyncIterator, Awaitable, Callable

from app.clients.llm_router import chat_completion
from app.services.json_calls import (
    orchestrator_call,
    parse_json_response,
)
from app.services.models import Participant, Session
from app.services.prompts import NO_REASONING_DIRECTIVE
from app.utils.sanitize import strip_thinking

LOG = logging.getLogger(__name__)


# How many distinct options the candidate-extraction LLM call may
# return. Cap is intentional: ranked-choice with > 6 options gets
# unwieldy for both LLM voters and human readers of the report.
MAX_CANDIDATES = 6


CANDIDATE_EXTRACTION_PROMPT = """The following are participants' final \
positions on this question:

Question: {question}

Participant positions:
{positions_block}

Cluster these into between 2 and {max_candidates} distinct option \
labels that capture the main answers being supported. Each label \
should be short (one sentence) and self-contained — a voter who \
hadn't read the transcript should still understand what they're \
voting for.

Return ONLY this JSON shape (no prose, no fences):
{{
  "options": ["short option 1", "short option 2", ...]
}}
"""


VOTE_SINGLE_PROMPT = """You are {participant_name}.

The group has been discussing this question:
  {question}

After deliberation, the choices on the table are:
{options_block}

Cast your vote for the ONE option you support. Return ONLY this JSON \
(no prose, no fences):
{{
  "choice": <integer 1..N of your top choice>,
  "reason": "one sentence on why"
}}
"""


VOTE_RANK_PROMPT = """You are {participant_name}.

The group has been discussing this question:
  {question}

After deliberation, the choices on the table are:
{options_block}

Rank ALL of the options from most preferred (rank 1) to least \
preferred. You must include every option exactly once. Return ONLY \
this JSON (no prose, no fences):
{{
  "ranking": [<rank-1 option number>, <rank-2 option number>, ...],
  "reason": "one sentence on your top choice"
}}
"""


VOTE_YESNO_PROMPT = """You are {participant_name}.

The chair has put the following motion before the assembly:

  Motion: {motion}

Cast your vote. Return ONLY this JSON (no prose, no fences):
{{
  "vote": "aye" | "nay" | "abstain",
  "reason": "one sentence on why"
}}
"""


def _format_positions_block(positions: dict[str, str], participants: list[Participant]) -> str:
    by_id = {p.participant_id: p for p in participants}
    lines: list[str] = []
    for pid, text in positions.items():
        name = by_id[pid].name if pid in by_id else pid
        lines.append(f"- {name}: {text}".strip())
    return "\n".join(lines) if lines else "(no positions recorded)"


def _format_options_block(options: list[str]) -> str:
    return "\n".join(f"  {i + 1}. {opt}" for i, opt in enumerate(options))


async def extract_candidate_options(
    *,
    session: Session,
    question: str,
    positions: dict[str, str],
    participants: list[Participant],
    max_candidates: int = MAX_CANDIDATES,
) -> list[str]:
    """Cluster finalized positions into a short list of distinct
    option labels for a vote.

    Falls back to using each participant's position verbatim (up to
    `max_candidates`) if the LLM call fails or returns nothing
    parseable.
    """
    if not positions:
        return []

    positions_block = _format_positions_block(positions, participants)
    prompt = CANDIDATE_EXTRACTION_PROMPT.format(
        question=question,
        positions_block=positions_block,
        max_candidates=max_candidates,
    )

    from app.services.orchestrator import _orchestrator_model_id, _bump_orchestrator_count

    raw, parsed = await orchestrator_call(
        orchestrator_model_id=_orchestrator_model_id(session),
        user_prompt=prompt,
        label="vote_candidate_extraction",
        api_log=session.api_log,
        expect_json=True,
        max_tokens=500,
        temperature=0.2,
    )
    _bump_orchestrator_count(session)

    options: list[str] = []
    if isinstance(parsed, dict):
        raw_opts = parsed.get("options") or []
        if isinstance(raw_opts, list):
            options = [str(o).strip() for o in raw_opts if str(o).strip()]

    # Truncate to cap.
    options = options[:max_candidates]

    if not options:
        # Fallback: take each unique position verbatim, truncated.
        seen: set[str] = set()
        for txt in positions.values():
            cleaned = (txt or "").strip()
            if not cleaned:
                continue
            key = cleaned[:80].lower()
            if key in seen:
                continue
            seen.add(key)
            # Single-line short version
            single = " ".join(cleaned.split())
            if len(single) > 160:
                single = single[:157] + "..."
            options.append(single)
            if len(options) >= max_candidates:
                break

    return options


async def gather_votes_parallel(
    voters: list[Participant],
    cast_fn: Callable[..., Awaitable[dict[str, Any]]],
    *,
    session: Session,
    default_mode: str = "single",
    **cast_kwargs: Any,
) -> list[tuple[Participant, dict[str, Any]]]:
    """Run ballot calls concurrently; roster order is preserved.

    Prefer ``iter_votes_parallel`` when the caller can yield SSE as each
    ballot lands — this helper still gathers everything first (legacy).
    """
    out: list[tuple[Participant, dict[str, Any]]] = []
    async for p, result in iter_votes_parallel(
        voters,
        cast_fn,
        session=session,
        default_mode=default_mode,
        preserve_roster_order=True,
        **cast_kwargs,
    ):
        out.append((p, result))
    return out


async def iter_votes_parallel(
    voters: list[Participant],
    cast_fn: Callable[..., Awaitable[dict[str, Any]]],
    *,
    session: Session,
    default_mode: str = "single",
    preserve_roster_order: bool = False,
    **cast_kwargs: Any,
) -> AsyncIterator[tuple[Participant, dict[str, Any]]]:
    """Yield ``(participant, ballot)`` as each vote completes.

    When ``preserve_roster_order`` is True, results are buffered and
    emitted in roster order after all votes finish (same UX as the old
    gather). Default is completion order so the ballot UI fills in live.
    """
    if not voters:
        return

    async def _one(p: Participant) -> tuple[Participant, dict[str, Any]]:
        result = await cast_fn(session=session, participant=p, **cast_kwargs)
        return p, result

    tasks = [
        asyncio.create_task(_one(p), name=f"vote:{p.participant_id}")
        for p in voters
    ]

    if preserve_roster_order:
        gathered = await asyncio.gather(*tasks, return_exceptions=True)
        for p, item in zip(voters, gathered):
            if isinstance(item, BaseException):
                LOG.exception("Parallel vote failed for %s: %s", p.participant_id, item)
                yield p, _vote_default(default_mode)
            else:
                yield item
        return

    for fut in asyncio.as_completed(tasks):
        try:
            item = await fut
        except BaseException as exc:
            LOG.exception("Parallel vote failed: %s", exc)
            continue
        yield item


async def cast_vote_single(
    *,
    session: Session,
    participant: Participant,
    question: str,
    options: list[str],
) -> dict[str, Any]:
    """Ask one participant to pick exactly one option.

    Returns {"choice": int (1-based, 0 if invalid), "reason": str,
    "ok": bool}. Always non-fatal — a malformed reply just yields
    {"choice": 0, ...} so the tally can skip it.
    """
    return await _cast_vote(
        session=session,
        participant=participant,
        prompt=VOTE_SINGLE_PROMPT.format(
            participant_name=participant.name,
            question=question,
            options_block=_format_options_block(options),
        ),
        mode="single",
        n_options=len(options),
    )


async def cast_vote_ranking(
    *,
    session: Session,
    participant: Participant,
    question: str,
    options: list[str],
) -> dict[str, Any]:
    """Ask one participant to fully rank all options.

    Returns {"ranking": [int, ...] (1-based, may be partial if the
    model misbehaved), "reason": str, "ok": bool}.
    """
    return await _cast_vote(
        session=session,
        participant=participant,
        prompt=VOTE_RANK_PROMPT.format(
            participant_name=participant.name,
            question=question,
            options_block=_format_options_block(options),
        ),
        mode="rank",
        n_options=len(options),
    )


async def cast_vote_yesno(
    *,
    session: Session,
    participant: Participant,
    motion: str,
) -> dict[str, Any]:
    """Ask one participant to vote aye/nay/abstain on a motion.

    Returns {"vote": "aye"|"nay"|"abstain"|"", "reason": str,
    "ok": bool}.
    """
    return await _cast_vote(
        session=session,
        participant=participant,
        prompt=VOTE_YESNO_PROMPT.format(
            participant_name=participant.name,
            motion=motion,
        ),
        mode="yesno",
        n_options=0,
    )


async def _cast_vote(
    *,
    session: Session,
    participant: Participant,
    prompt: str,
    mode: str,
    n_options: int,
) -> dict[str, Any]:
    if participant.kind == "human":
        # For now, treat human participants as abstaining in the
        # automated vote path. Future work: pause the orchestrator
        # and route through human_io so the user can cast a real
        # ballot. The decision method can detect this and surface a
        # note in the report.
        if mode == "yesno":
            return {"vote": "abstain", "reason": "(human participant)", "ok": False}
        if mode == "rank":
            return {"ranking": [], "reason": "(human participant)", "ok": False}
        return {"choice": 0, "reason": "(human participant)", "ok": False}

    system_text = (
        f"{participant.role_prompt}\n\n{NO_REASONING_DIRECTIVE}\n\n"
        "When asked to cast a vote, reply with ONLY the requested JSON "
        "object and no other text."
    )
    messages = [
        {"role": "system", "content": system_text},
        {"role": "user", "content": prompt},
    ]
    resolved = {
        "model_id": participant.model_id,
        "base_url": participant.base_url,
        "api_key": participant.api_key,
        "is_neon": participant.is_neon,
        "hana_model_id": participant.hana_model_id,
        "persona_name": participant.persona_name,
        "neon_direct_vllm": participant.neon_direct_vllm,
        "vllm_base_url": participant.vllm_base_url,
        "vllm_api_key": participant.vllm_api_key,
    }
    log_entry: dict[str, Any] = {
        "timestamp": time.time(),
        "label": f"vote:{mode}:{participant.participant_id}",
        "model": participant.model_id,
        "request": {"messages": messages, "max_tokens": 300},
    }
    try:
        result = await chat_completion(
            resolved=resolved,
            messages=messages,
            max_tokens=300,
            temperature=0.2,
            timeout=45.0,
        )
    except Exception as exc:  # noqa: BLE001
        LOG.warning("vote %s for %s failed: %s", mode, participant.participant_id, exc)
        log_entry["response"] = {"error": str(exc)}
        session.api_log.append(log_entry)
        return _vote_default(mode)

    log_entry["response"] = result
    session.api_log.append(log_entry)

    if result.get("error"):
        return _vote_default(mode)

    raw = strip_thinking(result.get("response", ""))
    return _parse_vote(raw, mode=mode, n_options=n_options)


def _vote_default(mode: str) -> dict[str, Any]:
    if mode == "yesno":
        return {"vote": "", "reason": "", "ok": False}
    if mode == "rank":
        return {"ranking": [], "reason": "", "ok": False}
    return {"choice": 0, "reason": "", "ok": False}


def _parse_vote(raw: str, *, mode: str, n_options: int) -> dict[str, Any]:
    parsed = parse_json_response(raw)
    if not isinstance(parsed, dict):
        return _vote_default(mode)

    reason = str(parsed.get("reason") or "").strip()

    if mode == "yesno":
        vote = str(parsed.get("vote") or "").strip().lower()
        if vote not in ("aye", "nay", "abstain"):
            return {"vote": "", "reason": reason, "ok": False}
        return {"vote": vote, "reason": reason, "ok": True}

    if mode == "rank":
        raw_rank = parsed.get("ranking") or parsed.get("rank") or []
        if not isinstance(raw_rank, list):
            return {"ranking": [], "reason": reason, "ok": False}
        ranking: list[int] = []
        seen: set[int] = set()
        for item in raw_rank:
            try:
                idx = int(item)
            except (TypeError, ValueError):
                continue
            if 1 <= idx <= n_options and idx not in seen:
                seen.add(idx)
                ranking.append(idx)
        ok = len(ranking) == n_options
        return {"ranking": ranking, "reason": reason, "ok": ok}

    # single-choice
    try:
        choice = int(parsed.get("choice") or 0)
    except (TypeError, ValueError):
        choice = 0
    if not (1 <= choice <= n_options):
        choice = 0
    return {"choice": choice, "reason": reason, "ok": choice > 0}


# ---------------------------------------------------------------------------
# Tallying
# ---------------------------------------------------------------------------

def tally_single_votes(
    ballots: list[dict[str, Any]],
    n_options: int,
) -> dict[str, Any]:
    """Tally one-shot plurality votes.

    `ballots` items shape: {"choice": int 1..N or 0, ...}.

    Returns:
      {
        "counts": [vote_count_for_option_1, ..._for_option_N],
        "winner": int (1-based; 0 if no votes),
        "tied_for_first": [int, ...],
        "total_cast": int,
        "abstentions": int,
      }
    """
    counts = [0] * n_options
    cast = 0
    abst = 0
    for b in ballots:
        choice = b.get("choice", 0)
        if isinstance(choice, int) and 1 <= choice <= n_options:
            counts[choice - 1] += 1
            cast += 1
        else:
            abst += 1
    if cast == 0:
        return {
            "counts": counts, "winner": 0, "tied_for_first": [],
            "total_cast": 0, "abstentions": abst,
        }
    top = max(counts)
    leaders = [i + 1 for i, c in enumerate(counts) if c == top]
    return {
        "counts": counts,
        "winner": leaders[0] if len(leaders) == 1 else 0,
        "tied_for_first": leaders if len(leaders) > 1 else [],
        "total_cast": cast,
        "abstentions": abst,
    }


def tally_yesno_votes(ballots: list[dict[str, Any]]) -> dict[str, Any]:
    """Tally aye/nay/abstain motion votes.

    Returns: {"aye": int, "nay": int, "abstain": int,
              "passes": bool, "majority": "aye"|"nay"|"tie",
              "ratio_aye": float}.
    """
    aye = sum(1 for b in ballots if b.get("vote") == "aye")
    nay = sum(1 for b in ballots if b.get("vote") == "nay")
    abst = sum(
        1 for b in ballots
        if b.get("vote") == "abstain" or not b.get("vote")
    )
    cast = aye + nay
    if cast == 0:
        return {
            "aye": aye, "nay": nay, "abstain": abst,
            "passes": False, "majority": "tie", "ratio_aye": 0.0,
        }
    if aye > nay:
        majority = "aye"
    elif nay > aye:
        majority = "nay"
    else:
        majority = "tie"
    return {
        "aye": aye, "nay": nay, "abstain": abst,
        "passes": aye > nay,
        "majority": majority,
        "ratio_aye": aye / cast,
    }


def run_irv(
    ballots: list[list[int]],
    n_options: int,
) -> dict[str, Any]:
    """Instant-runoff tally on 1-based ranking ballots.

    A ballot is a list of 1-based option indices in order of
    preference; partial ballots are tolerated. Eliminate the
    lowest-first-choice option each round, redistribute its top-rank
    votes to the next still-eligible choice on each ballot, until one
    option has >50% or all but one are eliminated.

    Returns:
      {
        "rounds": [ {round: int, counts: {option_idx: count},
                      eliminated: int or None,
                      winner: int or None}, ... ],
        "winner": int (1-based; 0 if no ballots),
        "tied": bool,
      }
    """
    if not ballots or n_options <= 0:
        return {"rounds": [], "winner": 0, "tied": False}

    eligible: set[int] = set(range(1, n_options + 1))
    # Per-ballot cursor (skips eliminated options on the fly)
    rounds: list[dict[str, Any]] = []
    round_n = 0

    while True:
        round_n += 1
        counts: dict[int, int] = {opt: 0 for opt in eligible}
        for ballot in ballots:
            top: int | None = None
            for opt in ballot:
                if opt in eligible:
                    top = opt
                    break
            if top is not None:
                counts[top] = counts.get(top, 0) + 1

        total = sum(counts.values())
        if total == 0:
            rounds.append({"round": round_n, "counts": counts,
                           "eliminated": None, "winner": None})
            return {"rounds": rounds, "winner": 0, "tied": False}

        # Check for majority winner
        for opt, c in counts.items():
            if c * 2 > total:
                rounds.append({"round": round_n, "counts": counts,
                               "eliminated": None, "winner": opt})
                return {"rounds": rounds, "winner": opt, "tied": False}

        # Only one option left → it wins by default
        if len(eligible) == 1:
            sole = next(iter(eligible))
            rounds.append({"round": round_n, "counts": counts,
                           "eliminated": None, "winner": sole})
            return {"rounds": rounds, "winner": sole, "tied": False}

        # Eliminate the option with the fewest first-rank votes; on a
        # tie at the bottom, eliminate the one with the lowest 1-based
        # index (deterministic tiebreak).
        lowest = min(counts.values())
        candidates_to_drop = sorted(
            opt for opt, c in counts.items() if c == lowest
        )
        # If ALL remaining options tie at the bottom, we have a
        # degenerate tie — no winner.
        if len(candidates_to_drop) == len(eligible):
            rounds.append({"round": round_n, "counts": counts,
                           "eliminated": None, "winner": None})
            return {"rounds": rounds, "winner": 0, "tied": True}
        drop = candidates_to_drop[0]
        eligible.discard(drop)
        rounds.append({"round": round_n, "counts": counts,
                       "eliminated": drop, "winner": None})

        # Safety: cap iterations at n_options + 1.
        if round_n > n_options + 1:  # pragma: no cover
            return {"rounds": rounds, "winner": 0, "tied": True}
