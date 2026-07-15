"""Configured ("extra") personas loaded from persona_config.yaml.

HANA personas are catalogued separately and tagged Neon at API time.
This module only covers YAML-defined panel members.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml

LOG = logging.getLogger(__name__)

_CONFIG_CANDIDATES = (
    Path(__file__).resolve().parent.parent.parent / "persona_config.yaml",
    Path(__file__).resolve().parent.parent / "persona_config.yaml",
)


@dataclass(frozen=True)
class ExtraPersonaSpec:
    participant_id: str
    name: str
    default_model_id: str
    role_prompt: str
    tag: str = "General"


def _resolve_config_path() -> Path:
    for candidate in _CONFIG_CANDIDATES:
        if candidate.is_file():
            return candidate
    raise FileNotFoundError(
        "persona_config.yaml not found. Expected at backend/persona_config.yaml",
    )


def _parse_persona(raw: dict[str, Any], index: int) -> ExtraPersonaSpec:
    required = ("id", "name", "tag", "default_model_id", "role_prompt")
    missing = [k for k in required if not str(raw.get(k) or "").strip()]
    if missing:
        raise ValueError(
            f"persona_config.yaml personas[{index}] missing fields: {', '.join(missing)}",
        )
    return ExtraPersonaSpec(
        participant_id=str(raw["id"]).strip(),
        name=str(raw["name"]).strip(),
        tag=str(raw["tag"]).strip(),
        default_model_id=str(raw["default_model_id"]).strip(),
        role_prompt=str(raw["role_prompt"]).strip(),
    )


@lru_cache(maxsize=1)
def _load_specs() -> tuple[ExtraPersonaSpec, ...]:
    path = _resolve_config_path()
    with path.open(encoding="utf-8") as fh:
        data = yaml.safe_load(fh) or {}
    raw_list = data.get("personas") or []
    if not isinstance(raw_list, list):
        raise ValueError("persona_config.yaml: 'personas' must be a list")
    specs = tuple(_parse_persona(item, i) for i, item in enumerate(raw_list))
    LOG.info("Loaded %d personas from %s", len(specs), path)
    return specs


def reload_persona_config() -> None:
    """Clear the cached YAML load (useful in tests / hot-reload)."""
    _load_specs.cache_clear()


def list_configured_personas() -> list[ExtraPersonaSpec]:
    return list(_load_specs())


def list_extra_personas() -> list[dict]:
    return [
        {
            "participant_id": p.participant_id,
            "name": p.name,
            "default_model_id": p.default_model_id,
            "role_prompt": p.role_prompt,
            "kind": "extra",
            "tag": p.tag,
        }
        for p in _load_specs()
    ]


def get_extra_persona(participant_id: str) -> ExtraPersonaSpec | None:
    for p in _load_specs():
        if p.participant_id == participant_id:
            return p
    return None


def list_tags() -> list[str]:
    """Unique tags from YAML personas, sorted (Neon added at catalog API)."""
    return sorted({p.tag for p in _load_specs() if p.tag})


def get_extra_personas() -> list[ExtraPersonaSpec]:
    """Alias used by chat candidate-pool builders."""
    return list_configured_personas()
