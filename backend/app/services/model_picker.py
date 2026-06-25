"""Pick a neutral, general-purpose model for meta-LLM tasks.

Used by role-prompt generation and model suggestion so those calls do
not run through a Neon character persona (which injects its own identity).
"""
from __future__ import annotations

from app.config import settings


def is_neon_character_model_id(model_id: str | None) -> bool:
    return bool(model_id and model_id.startswith("neon:"))


def is_vanilla_neon_model_id(model_id: str | None) -> bool:
    return is_neon_character_model_id(model_id) and model_id.rsplit(":", 1)[-1] == "vanilla"


def pick_general_purpose_model(
    preferred: str | None = None,
    *,
    extra_model_ids: list[str] | None = None,
) -> str | None:
    """Return a model id suitable for neutral writing / analysis tasks.

    Resolution order:
    1. preferred if resolvable and NOT a Neon character
    2. settings.orchestrator_model if resolvable and NOT Neon
    3. first resolvable model from settings.providers
    4. extra_model_ids Neon entries ending in ':vanilla'
    5. any other resolvable Neon id from extra_model_ids (last resort)
    """
    seen: set[str] = set()
    non_neon: list[str] = []
    vanilla_neon: list[str] = []
    other_neon: list[str] = []

    def _bucket(mid: str) -> None:
        if not mid or mid in seen or not settings.resolve_model(mid):
            return
        seen.add(mid)
        if is_neon_character_model_id(mid):
            if is_vanilla_neon_model_id(mid):
                vanilla_neon.append(mid)
            else:
                other_neon.append(mid)
        else:
            non_neon.append(mid)

    for mid in [preferred, settings.orchestrator_model]:
        if mid and not is_neon_character_model_id(mid):
            _bucket(mid)

    for prov in settings.providers:
        for m in prov.get("models") or []:
            _bucket((m.get("id") or "").strip())

    for mid in extra_model_ids or []:
        _bucket((mid or "").strip())

    ordered = non_neon + vanilla_neon + other_neon
    return ordered[0] if ordered else None
