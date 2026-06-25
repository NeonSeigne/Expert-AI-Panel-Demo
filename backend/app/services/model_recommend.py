"""Suggest an LLM for an Expert Persona based on its prompt text."""
from __future__ import annotations

import logging
import re
from typing import Any

from app.config import settings
from app.clients.llm_router import chat_completion
from app.services.json_calls import parse_json_response
from app.services.model_picker import (
    is_neon_character_model_id,
    is_vanilla_neon_model_id,
    pick_general_purpose_model,
)
from app.services.prompts.model_recommend import SUGGEST_MODEL_PROMPT
from app.utils.sanitize import strip_thinking

LOG = logging.getLogger(__name__)

_SOURCE_TEXT_MAX_CHARS = 4000
_ROLE_PROMPT_MAX_CHARS = 4000

_SUGGEST_SYSTEM_DIRECTIVE = (
    "You help users pick an LLM model for a persona. "
    "Follow the output format in the user message exactly. "
    "Return ONLY the two requested lines — no preamble, analysis, or markdown."
)


def _truncate(text: str, max_chars: int) -> str:
    text = (text or "").strip()
    if len(text) <= max_chars:
        return text
    return text[:max_chars].rstrip() + "..."


def _models_block(models: list[dict[str, Any]]) -> str:
    """One line per model: id, display name, provider/family, kind."""
    lines: list[str] = []
    for i, m in enumerate(models, start=1):
        mid = (m.get("id") or "").strip()
        if not mid:
            continue
        name = (m.get("name") or mid).strip()
        provider = (m.get("provider") or "").strip()
        family = provider or "Unknown"
        kind = (m.get("kind") or "provider").strip()
        lines.append(
            f"{i}. id={mid} | name={name} | family={family} | kind={kind}"
        )
    return "\n".join(lines) if lines else "(no models provided)"


def _panel_block(panel: list[dict[str, Any]]) -> str:
    """Describe other participants already in the panel."""
    if not panel:
        return ""
    lines: list[str] = [
        "Other participants already in this panel (avoid recommending "
        "the same model family for every persona when alternatives "
        "fit equally well):\n",
    ]
    for i, p in enumerate(panel, start=1):
        name = (p.get("name") or "Unnamed").strip()
        mid = (p.get("model_id") or "").strip()
        provider = (p.get("provider") or "").strip()
        lines.append(
            f"{i}. name={name} | model_id={mid or '(default)'} "
            f"| family={provider or 'Unknown'}"
        )
    lines.append("")
    return "\n".join(lines)


def _validate_model_id(model_id: str | None, models: list[dict[str, Any]]) -> str | None:
    """Return model_id if it exists in the submitted list, else None."""
    if not model_id or not isinstance(model_id, str):
        return None
    valid = {(m.get("id") or "").strip() for m in models}
    mid = model_id.strip()
    return mid if mid in valid else None


def _parse_suggest_response(
    raw: str,
    models: list[dict[str, Any]],
) -> tuple[str | None, str]:
    """Extract recommended_model_id + rationale from LLM output."""
    parsed = parse_json_response(raw)
    if isinstance(parsed, dict):
        rid = parsed.get("recommended_model_id")
        rat = parsed.get("rationale", "")
        if isinstance(rid, str) and rid.strip():
            return rid.strip(), rat.strip() if isinstance(rat, str) else ""

    id_match = re.search(
        r"recommended_model_id\s*[:=]\s*[\"']?([^\s\"'\n]+)",
        raw,
        re.IGNORECASE,
    )
    if id_match:
        rid = id_match.group(1).strip().strip('"').strip("'")
        rat_match = re.search(
            r"rationale\s*[:=]\s*(.+)",
            raw,
            re.IGNORECASE | re.DOTALL,
        )
        rationale = rat_match.group(1).strip() if rat_match else ""
        validated = _validate_model_id(rid, models)
        if validated:
            return validated, rationale

    for model in sorted(models, key=lambda m: len(m.get("id") or ""), reverse=True):
        mid = (model.get("id") or "").strip()
        if mid and mid in raw:
            return mid, "Inferred from model analysis."

    raw_lower = raw.lower()
    for model in models:
        name = (model.get("name") or "").strip()
        if name and len(name) >= 4 and name.lower() in raw_lower:
            mid = (model.get("id") or "").strip()
            if mid:
                return mid, "Inferred from model name in response."
        provider = (model.get("provider") or "").strip()
        for part in provider.replace(",", "/").split("/"):
            token = part.strip()
            if len(token) >= 6 and token.lower() in raw_lower:
                mid = (model.get("id") or "").strip()
                if mid:
                    return mid, f"Inferred from '{token}' in response."

    return None, ""


def _meta_model_candidates(
    preferred: str,
    available_models: list[dict[str, Any]],
) -> list[str]:
    """Ordered model ids for the meta-LLM call (neutral writer first)."""
    extra = [(m.get("id") or "").strip() for m in available_models]
    seen: set[str] = set()
    out: list[str] = []

    primary = pick_general_purpose_model(preferred, extra_model_ids=extra)
    for mid in [primary]:
        if mid and mid not in seen:
            seen.add(mid)
            out.append(mid)

    for prov in settings.providers:
        for m in prov.get("models") or []:
            mid = (m.get("id") or "").strip()
            if (
                mid
                and mid not in seen
                and not is_neon_character_model_id(mid)
                and settings.resolve_model(mid)
            ):
                seen.add(mid)
                out.append(mid)

    for m in available_models:
        mid = (m.get("id") or "").strip()
        if (
            mid
            and mid not in seen
            and is_vanilla_neon_model_id(mid)
            and settings.resolve_model(mid)
        ):
            seen.add(mid)
            out.append(mid)

    return out


def _source_mentions_neon_character(source_text: str, model: dict[str, Any]) -> bool:
    """True when source text plausibly references this named Neon character."""
    source_lower = (source_text or "").lower()
    if not source_lower:
        return False

    tokens: set[str] = set()
    name = (model.get("name") or "").strip().lower()
    if name and name != "vanilla" and len(name) >= 4:
        tokens.add(name)

    provider = (model.get("provider") or "")
    for part in provider.replace("/", " ").replace(",", " ").split():
        token = part.strip().lower()
        if len(token) >= 5 and token not in ("neon", "vanilla", "brainforge"):
            tokens.add(token)

    mid = (model.get("id") or "")
    if is_neon_character_model_id(mid):
        base = mid.split(":", 2)[1] if mid.count(":") >= 2 else ""
        for segment in base.replace("@", "/").split("/"):
            token = segment.strip().lower()
            if len(token) >= 5:
                tokens.add(token)

    return any(token in source_lower for token in tokens)


def _deprioritize_neon_mismatch(
    recommended_id: str,
    source_text: str,
    models: list[dict[str, Any]],
) -> str:
    """Swap named Neon picks that don't match source for a general model."""
    if len(models) <= 1:
        return recommended_id

    model_by_id = {m["id"]: m for m in models if (m.get("id") or "").strip()}
    rec = model_by_id.get(recommended_id)
    if not rec:
        return recommended_id

    kind = (rec.get("kind") or "provider").strip()
    if kind != "neon_character" or is_vanilla_neon_model_id(recommended_id):
        return recommended_id

    if _source_mentions_neon_character(source_text, rec):
        return recommended_id

    LOG.warning(
        "Neon character %s does not match source description; preferring general model",
        recommended_id,
    )

    for m in models:
        if (m.get("kind") or "provider") == "provider":
            return m["id"]
    for m in models:
        if is_vanilla_neon_model_id(m.get("id")):
            return m["id"]
    return recommended_id


async def _meta_suggest_call(model_id: str, user_prompt: str) -> str:
    """Run the suggestion meta-LLM via chat_completion (Neon + external)."""
    resolved = settings.resolve_model(model_id)
    if not resolved:
        return ""

    messages = [
        {"role": "system", "content": _SUGGEST_SYSTEM_DIRECTIVE},
        {"role": "user", "content": user_prompt},
    ]
    try:
        result = await chat_completion(
            resolved=resolved,
            messages=messages,
            temperature=0.2,
            max_tokens=256,
            timeout=45,
        )
    except Exception as exc:
        LOG.exception("suggest_model meta-LLM call failed: %s", exc)
        return ""

    if result.get("error"):
        LOG.warning("suggest_model meta-LLM error: %s", result.get("response"))
        return ""

    return strip_thinking(result.get("response", ""))


async def suggest_model_for_persona(
    *,
    orchestrator_model_id: str,
    persona_name: str,
    source_text: str = "",
    role_prompt: str = "",
    available_models: list[dict[str, Any]],
    panel_context: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Return {recommended_model_id, rationale} or {error: str}."""
    source = _truncate(source_text, _SOURCE_TEXT_MAX_CHARS)
    prompt_text = _truncate(role_prompt, _ROLE_PROMPT_MAX_CHARS)

    if not source and not prompt_text:
        return {
            "error": (
                "Enter a description or role prompt for a model to be suggested."
            ),
        }

    models = [m for m in available_models if (m.get("id") or "").strip()]
    if not models:
        return {"error": "No models available to recommend from."}

    if len(models) == 1:
        only = models[0]
        return {
            "recommended_model_id": only["id"],
            "rationale": "Only one model is available in the builder.",
        }

    panel = panel_context or []
    user_prompt = SUGGEST_MODEL_PROMPT.format(
        persona_name=(persona_name or "Unnamed").strip(),
        source_text=source or "(not provided — rely on role prompt below)",
        role_prompt=prompt_text or "(not provided — rely on description above)",
        models_block=_models_block(models),
        panel_block=_panel_block(panel),
    )

    meta_candidates = _meta_model_candidates(orchestrator_model_id, models)
    if not meta_candidates:
        return {
            "error": "Model suggestion unavailable — no LLM configured to run the analysis.",
        }

    recommended: str | None = None
    rationale = ""
    for meta_model_id in meta_candidates:
        raw = await _meta_suggest_call(meta_model_id, user_prompt)
        recommended, rationale = _parse_suggest_response(raw, models)
        if recommended and _validate_model_id(recommended, models):
            break
        recommended = None
        rationale = ""

    validated = _validate_model_id(recommended, models)
    if not validated:
        LOG.warning(
            "suggest_model returned invalid id %r; valid=%s",
            recommended,
            [m.get("id") for m in models[:5]],
        )
        return {
            "error": "Model suggestion unavailable — please pick manually.",
        }

    validated = _deprioritize_neon_mismatch(validated, source, models)

    if not settings.resolve_model(validated):
        LOG.warning("suggest_model picked unresolvable id %s", validated)
        return {
            "error": "Suggested model is no longer available — please pick manually.",
        }

    if not rationale:
        rationale = "Recommended based on persona fit."

    return {
        "recommended_model_id": validated,
        "rationale": rationale,
    }
