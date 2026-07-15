"""Smoke-test LLM availability.

Enumerates the same model ids the frontend settings picker shows
(provider models from settings + Neon personas from HANA) and pings each
with a minimal chat completion via llm_router.chat_completion.
"""
from __future__ import annotations

import asyncio
import os
import time
from dataclasses import dataclass, field
from typing import Any

from app.clients.llm_router import chat_completion
from app.config import settings

SMOKE_MESSAGES = [
    {"role": "user", "content": "Reply with exactly the single word: OK"},
]
SMOKE_MAX_TOKENS = 32
SMOKE_TIMEOUT = 90.0


@dataclass
class ModelTarget:
    model_id: str
    display_name: str
    provider: str
    kind: str  # "provider" | "neon_character"


@dataclass
class SmokeResult:
    model_id: str
    display_name: str
    provider: str
    kind: str
    ok: bool
    elapsed_seconds: float = 0.0
    error_kind: str = ""
    error_status: int | None = None
    response_preview: str = ""
    detail: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "model_id": self.model_id,
            "display_name": self.display_name,
            "provider": self.provider,
            "kind": self.kind,
            "ok": self.ok,
            "elapsed_seconds": self.elapsed_seconds,
            "error_kind": self.error_kind,
            "error_status": self.error_status,
            "response_preview": self.response_preview,
            "detail": self.detail,
        }


def provider_model_targets() -> list[ModelTarget]:
    """External provider models from settings.providers."""
    targets: list[ModelTarget] = []
    for prov in settings.providers:
        for m in prov.get("models") or []:
            mid = (m.get("id") or "").strip()
            if not mid:
                continue
            targets.append(ModelTarget(
                model_id=mid,
                display_name=(m.get("name") or mid).strip(),
                provider=(prov.get("name") or prov.get("id") or "unknown").strip(),
                kind="provider",
            ))
    return targets


def neon_model_targets(neon_models: list[dict[str, Any]]) -> list[ModelTarget]:
    """Neon HANA personas — same ids as frontend allModelsFlat."""
    targets: list[ModelTarget] = []
    for nm in neon_models or []:
        hana_id = nm.get("model_id") or ""
        short = (nm.get("name") or "").split("/")[-1] or hana_id
        for p in nm.get("personas") or []:
            if p.get("enabled") is False:
                continue
            persona = (p.get("persona_name") or "").strip()
            if not persona:
                continue
            targets.append(ModelTarget(
                model_id=f"neon:{hana_id}:{persona}",
                display_name=persona,
                provider=f"Neon / {short}",
                kind="neon_character",
            ))
    return targets


def filter_targets(
    targets: list[ModelTarget],
    *,
    filter_substr: str | None = None,
    kinds: set[str] | None = None,
) -> list[ModelTarget]:
    """Optional substring filter (MODEL_TEST_FILTER env) and kind filter."""
    out = targets
    if kinds:
        out = [t for t in out if t.kind in kinds]
    if filter_substr:
        needle = filter_substr.lower()
        out = [
            t for t in out
            if needle in t.model_id.lower()
            or needle in t.display_name.lower()
            or needle in t.provider.lower()
        ]
    return out


def _classify_failure(result: dict[str, Any], response: str) -> str:
    if result.get("error"):
        kind = result.get("error_kind") or "unknown"
        status = result.get("error_status")
        if status:
            return f"api_error ({kind}, HTTP {status})"
        return f"api_error ({kind})"
    if not (response or "").strip():
        return "empty_response"
    if response.strip().startswith("[Error"):
        return "error_text_in_response"
    return ""


async def smoke_test_target(target: ModelTarget) -> SmokeResult:
    """Ping one model with a minimal completion request."""
    resolved = settings.resolve_model(target.model_id)
    if not resolved:
        return SmokeResult(
            model_id=target.model_id,
            display_name=target.display_name,
            provider=target.provider,
            kind=target.kind,
            ok=False,
            detail="unresolvable_model_id",
        )

    try:
        result = await chat_completion(
            resolved,
            SMOKE_MESSAGES,
            temperature=0.0,
            max_tokens=SMOKE_MAX_TOKENS,
            timeout=SMOKE_TIMEOUT,
        )
    except Exception as exc:
        return SmokeResult(
            model_id=target.model_id,
            display_name=target.display_name,
            provider=target.provider,
            kind=target.kind,
            ok=False,
            detail=f"exception: {exc}",
        )

    response = (result.get("response") or "").strip()
    failure = _classify_failure(result, response)
    preview = response[:120].replace("\n", " ")

    return SmokeResult(
        model_id=target.model_id,
        display_name=target.display_name,
        provider=target.provider,
        kind=target.kind,
        ok=not failure,
        elapsed_seconds=float(result.get("elapsed_seconds") or 0),
        error_kind=result.get("error_kind") or "",
        error_status=result.get("error_status"),
        response_preview=preview,
        detail=failure,
    )


async def collect_all_targets() -> list[ModelTarget]:
    """Provider models + live Neon catalog from HANA."""
    from app.clients.hana_client import hana_client

    targets = provider_model_targets()
    neon_models: list[dict[str, Any]] = []
    try:
        await hana_client.authenticate()
        neon_models = await hana_client.get_models()
    except Exception:
        pass
    targets.extend(neon_model_targets(neon_models))
    return targets


async def run_smoke_tests(
    *,
    filter_substr: str | None = None,
    kinds: set[str] | None = None,
    concurrency: int = 3,
) -> list[SmokeResult]:
    """Run smoke tests for all (or filtered) models. Returns full result list."""
    filter_substr = filter_substr or os.environ.get("MODEL_TEST_FILTER") or None
    targets = filter_targets(await collect_all_targets(), filter_substr=filter_substr, kinds=kinds)

    sem = asyncio.Semaphore(max(1, concurrency))

    async def _run_one(target: ModelTarget) -> SmokeResult:
        async with sem:
            return await smoke_test_target(target)

    results = await asyncio.gather(*[_run_one(t) for t in targets])
    return list(results)


def format_report(results: list[SmokeResult]) -> str:
    """Human-readable pass/fail table."""
    ok = [r for r in results if r.ok]
    bad = [r for r in results if not r.ok]
    lines = [
        f"Model smoke test: {len(ok)} passed, {len(bad)} failed, {len(results)} total",
        "",
    ]
    if bad:
        lines.append("FAILED:")
        for r in sorted(bad, key=lambda x: (x.provider, x.model_id)):
            extra = r.detail or r.error_kind or "unknown"
            status = f" HTTP {r.error_status}" if r.error_status else ""
            lines.append(
                f"  - [{r.provider}] {r.display_name} ({r.model_id}): {extra}{status}"
            )
            if r.response_preview:
                lines.append(f"      preview: {r.response_preview!r}")
        lines.append("")
    if ok:
        lines.append("PASSED:")
        for r in sorted(ok, key=lambda x: (x.provider, x.model_id)):
            lines.append(
                f"  + [{r.provider}] {r.display_name} ({r.elapsed_seconds:.1f}s)"
            )
    return "\n".join(lines)


def failure_summary(results: list[SmokeResult]) -> str:
    bad = [r for r in results if not r.ok]
    if not bad:
        return ""
    parts = [f"{r.model_id}: {r.detail or r.error_kind or 'failed'}" for r in bad]
    return "; ".join(parts)


async def _cli_main() -> int:
    results = await run_smoke_tests()
    print(format_report(results))
    bad = [r for r in results if not r.ok]
    return 1 if bad else 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(_cli_main()))
