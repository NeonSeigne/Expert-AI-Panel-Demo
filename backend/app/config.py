from __future__ import annotations

import os
from pathlib import Path

from pydantic import AliasChoices, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
_ENV_FILE = _PROJECT_ROOT / ".env"


def _shared_env_candidates() -> list[Path]:
    """Locations for the cross-project shared.env (never committed)."""
    explicit = (os.getenv("SHARED_ENV_PATH") or os.getenv("SHARED_ENV_FILE") or "").strip()
    if explicit:
        return [Path(explicit).expanduser()]
    return [
        Path.home() / ".secrets" / "shared.env",
        Path.home() / "Downloads" / "shared.env",
    ]


def _resolve_shared_env() -> Path | None:
    for candidate in _shared_env_candidates():
        if candidate.is_file():
            return candidate
    return None


def _settings_env_files() -> tuple[str, ...]:
    """Shared secrets first; project .env overrides."""
    files: list[str] = []
    shared = _resolve_shared_env()
    if shared:
        files.append(str(shared))
    if _ENV_FILE.is_file():
        files.append(str(_ENV_FILE))
    return tuple(files)


class Settings(BaseSettings):
    hana_base_url: str = "https://hana.neonaialpha.com"
    hana_username: str = "guest"
    hana_password: str = "password"
    # BrainForge/Security (4090 x1-3): separate HANA login — use HANA_KLATCHAT_PASSWORD or HANA_PASSWORD_KLATCHAT in project-root .env
    hana_username_klatchat: str = ""
    # Same value as HuggingFace Space secret API_KEY for 4090-x1-3 — OpenAI-compatible Bearer, NOT HANA /auth/login password.
    hana_password_klatchat: str = Field(
        default="",
        validation_alias=AliasChoices("HANA_KLATCHAT_PASSWORD", "HANA_PASSWORD_KLATCHAT"),
    )
    # Direct vLLM base (no /v1); matches brainforge-webapp docker config 4090-x1-3 host.
    neon_security_vllm_base_url: str = Field(
        default="https://4090-x1-3.neonaiservices2.com/vllm0",
        validation_alias=AliasChoices("NEON_SECURITY_VLLM_BASE_URL", "VLLM_BASE_URL"),
    )
    # Comma-separated model_id values to merge via get_personas when get_models omits them (needs HANA access)
    hana_neon_model_supplement_ids: str = "BrainForge/Security@2026.03.18"

    # OpenAI-compatible Bearer token for direct vLLM endpoints
    # (e.g. https://4090-x1-3.neonaiservices2.com/vllm0/v1). Distinct
    # from any HANA login credential. Sent as Authorization: Bearer.
    vllm_api_key: str = ""

    fireworks_api_key: str = ""
    together_api_key: str = ""
    openai_api_key: str = ""
    gemini_api_key: str = ""
    mistral_api_key: str = ""

    orchestrator_model: str = "gpt-4o-mini"
    # Lightweight model for addressed-to / status classifiers. Falls back
    # to orchestrator_model when unset or unresolvable.
    orchestrator_fast_model: str = "gemini-2.0-flash"
    speed_priority: bool = False

    cors_origins: str = "http://localhost:3000,http://localhost:3001,http://localhost:3002"

    model_config = SettingsConfigDict(
        env_file=_settings_env_files(),
        env_file_encoding="utf-8",
    )

    @field_validator("neon_security_vllm_base_url", mode="before")
    @classmethod
    def _strip_vllm_v1_suffix(cls, value: object) -> object:
        if isinstance(value, str):
            return value.rstrip("/").removesuffix("/v1")
        return value

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    def _neon_security_direct_vllm_enabled(self, hana_model_id: str) -> bool:
        """BrainForge/Security on 4090-x1-3: same pattern as brainforge-webapp (direct vLLM + API key).

        Gated on VLLM_API_KEY (the Bearer token sent to the vLLM
        /v1/chat/completions endpoint), NOT the HANA klatchat password.
        """
        if "security" not in (hana_model_id or "").lower():
            return False
        return bool((self.vllm_api_key or "").strip() and (self.neon_security_vllm_base_url or "").strip())

    @property
    def providers(self) -> list[dict]:
        """Build the flat list of all available LLM providers and their models."""
        providers: list[dict] = []
        fw_url = "https://api.fireworks.ai/inference/v1"
        fw_key = self.fireworks_api_key
        fw_ok = fw_key and fw_key != "your-fireworks-api-key-here"
        tg_url = "https://api.together.xyz/v1"
        tg_key = self.together_api_key
        tg_ok = tg_key and tg_key != "your-together-api-key-here"

        if fw_ok:
            providers.append({
                "id": "kimi",
                "name": "Kimi",
                "base_url": fw_url,
                "api_key": fw_key,
                "models": [
                    {"id": "accounts/fireworks/models/kimi-k2-thinking", "name": "Kimi K2 Thinking", "params": "1T (32B active)"},
                    {"id": "accounts/fireworks/models/kimi-k2-instruct-0905", "name": "Kimi K2 Instruct 0905", "params": "1T (32B active)"},
                    {"id": "accounts/fireworks/models/kimi-k2p5", "name": "Kimi K2.5", "params": "1T (32B active)"},
                ],
            })
            providers.append({
                "id": "deepseek",
                "name": "DeepSeek",
                "base_url": fw_url,
                "api_key": fw_key,
                "models": [
                    {"id": "accounts/fireworks/models/deepseek-v3p1", "name": "DeepSeek V3.1", "params": "671B (37B active)"},
                    {"id": "accounts/fireworks/models/deepseek-v3p2", "name": "DeepSeek V3.2", "params": "671B (37B active)"},
                ],
            })

        oai_ok = self.openai_api_key and self.openai_api_key != "your-openai-api-key-here"
        if oai_ok or fw_ok or tg_ok:
            oai_models = []
            if oai_ok:
                oai_models.extend([
                    {"id": "gpt-5.4", "name": "GPT-5.4", "params": "Undisclosed"},
                    {"id": "gpt-4.1", "name": "GPT-4.1", "params": "Undisclosed"},
                    {"id": "gpt-4o", "name": "GPT-4o", "params": "~200B (estimated)"},
                    {"id": "gpt-4o-mini", "name": "GPT-4o Mini", "params": "~8B (estimated)"},
                    {"id": "gpt-4.1-mini", "name": "GPT-4.1 Mini", "params": "Undisclosed"},
                    {"id": "o4-mini", "name": "o4-Mini", "params": "Undisclosed"},
                ])
            if fw_ok:
                oai_models.append({
                    "id": "accounts/fireworks/models/gpt-oss-120b",
                    "name": "GPT-OSS 120B",
                    "params": "117B (5.1B active)",
                    "base_url": fw_url,
                    "api_key": fw_key,
                })
            if tg_ok:
                oai_models.append({
                    "id": "openai/gpt-oss-20b",
                    "name": "GPT-OSS 20B",
                    "params": "~20B",
                    "base_url": tg_url,
                    "api_key": tg_key,
                })
            if oai_models:
                providers.append({
                    "id": "openai",
                    "name": "OpenAI",
                    "base_url": "https://api.openai.com/v1",
                    "api_key": self.openai_api_key if oai_ok else "",
                    "models": oai_models,
                })

        mistral_ok = self.mistral_api_key and self.mistral_api_key != "your-mistral-api-key-here"
        if mistral_ok:
            providers.append({
                "id": "mistral",
                "name": "Mistral",
                "base_url": "https://api.mistral.ai/v1",
                "api_key": self.mistral_api_key,
                "models": [
                    {"id": "mistral-small-2506", "name": "Mistral Small 3.2", "params": "24B"},
                    {"id": "mistral-small-2603", "name": "Mistral Small 4", "params": "119B"},
                    {"id": "devstral-2512", "name": "Devstral2", "params": "123B"},
                ],
            })
            providers.append({
                "id": "qwen",
                "name": "Qwen",
                "base_url": tg_url,
                "api_key": tg_key,
                "models": [
                    {"id": "Qwen/Qwen3-VL-8B-Instruct", "name": "Qwen3 VL 8B", "params": "8B"},
                ],
            })
            providers.append({
                "id": "meta",
                "name": "Meta Llama",
                "base_url": tg_url,
                "api_key": tg_key,
                "models": [
                    {"id": "meta-llama/Llama-3.3-70B-Instruct-Turbo", "name": "Llama 3.3 70B Turbo", "params": "70B"},
                    {"id": "meta-llama/Meta-Llama-3-8B-Instruct-Lite", "name": "Llama 3 8B Lite", "params": "8B"},
                ],
            })

        if self.gemini_api_key and self.gemini_api_key != "your-gemini-api-key-here":
            providers.append({
                "id": "gemini",
                "name": "Google Gemini",
                "base_url": "https://generativelanguage.googleapis.com/v1beta/openai/",
                "api_key": self.gemini_api_key,
                "models": [
                    {"id": "gemini-2.0-flash", "name": "Gemini 2.0 Flash", "params": "Undisclosed"},
                    {"id": "gemini-2.5-flash", "name": "Gemini 2.5 Flash", "params": "Undisclosed"},
                    {"id": "gemini-2.5-pro", "name": "Gemini 2.5 Pro", "params": "Undisclosed"},
                ],
            })
        return providers

    def resolve_model(self, model_id: str) -> dict | None:
        """Given a model_id, return {base_url, api_key, model_id, ...} or None.

        Handles both external providers and Neon HANA models (prefixed with 'neon:').
        """
        if model_id.startswith("neon:"):
            parts = model_id.split(":", 2)
            if len(parts) == 3:
                hana_model_id = parts[1]
                persona_name = parts[2]
                out: dict = {
                    "is_neon": True,
                    "model_id": model_id,
                    "hana_model_id": hana_model_id,
                    "persona_name": persona_name,
                    "display_name": persona_name,
                    "provider": "Neon",
                    "base_url": self.hana_base_url,
                    "api_key": "",
                }
                if self._neon_security_direct_vllm_enabled(hana_model_id):
                    out["neon_direct_vllm"] = True
                    out["vllm_base_url"] = f"{self.neon_security_vllm_base_url.rstrip('/')}/v1"
                    out["vllm_api_key"] = self.vllm_api_key
                return out

        for prov in self.providers:
            for m in prov["models"]:
                if m["id"] == model_id:
                    return {
                        "base_url": m.get("base_url", prov["base_url"]),
                        "api_key": m.get("api_key", prov["api_key"]),
                        "model_id": m["id"],
                        "display_name": m["name"],
                        "provider": prov["name"],
                    }
        return None


settings = Settings()
