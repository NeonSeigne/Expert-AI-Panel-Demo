from __future__ import annotations

import json
import logging
import time
from typing import Any

import httpx

from app.config import settings

LOG = logging.getLogger(__name__)


class HanaClient:
    """Handles HANA API authentication, model/persona discovery, and inference."""

    def __init__(self) -> None:
        self._base = settings.hana_base_url.rstrip("/")
        self._access_token: str = ""
        self._refresh_token: str = ""
        self._token_expiry: float = 0
        self._klatchat_access_token: str = ""
        self._klatchat_refresh_token: str = ""
        self._klatchat_token_expiry: float = 0
        self._client = httpx.AsyncClient(timeout=30.0)
        self._persona_cache: dict[str, str | None] = {}

    def _uses_klatchat_model(self, model_id: str) -> bool:
        """Legacy HANA-JWT path for Security — disabled when using direct vLLM (brainforge-webapp pattern)."""
        if settings._neon_security_direct_vllm_enabled(model_id):
            return False
        if not (settings.hana_password_klatchat or "").strip():
            return False
        mid = (model_id or "").lower()
        return "brainforge/security" in mid or "/security@" in mid

    async def authenticate(self) -> None:
        resp = await self._client.post(
            f"{self._base}/auth/login",
            json={
                "username": settings.hana_username,
                "password": settings.hana_password,
                "token_name": "LLMChats3",
                "client_id": "llm-chat-tool",
            },
        )
        resp.raise_for_status()
        data = resp.json()
        self._access_token = data["access_token"]
        self._refresh_token = data["refresh_token"]
        self._token_expiry = data.get("expiration", time.time() + 3600)
        LOG.info("HANA auth success (user=%s)", data.get("username"))

    async def authenticate_klatchat(self) -> None:
        """Login for BrainForge/Security (4090) using HANA_KLATCHAT_PASSWORD."""
        uname = (settings.hana_username_klatchat or settings.hana_username).strip()
        pwd = (settings.hana_password_klatchat or "").strip()
        if not pwd:
            raise ValueError("hana_password_klatchat not set")
        resp = await self._client.post(
            f"{self._base}/auth/login",
            json={
                "username": uname,
                "password": pwd,
                "token_name": "LLMChats3",
                "client_id": "llm-chat-tool",
            },
        )
        resp.raise_for_status()
        data = resp.json()
        self._klatchat_access_token = data["access_token"]
        self._klatchat_refresh_token = data["refresh_token"]
        self._klatchat_token_expiry = data.get("expiration", time.time() + 3600)
        LOG.info("HANA klatchat auth success (user=%s)", data.get("username"))

    async def _ensure_token(self) -> None:
        if time.time() >= self._token_expiry - 60:
            try:
                resp = await self._client.post(
                    f"{self._base}/auth/refresh",
                    json={
                        "access_token": self._access_token,
                        "refresh_token": self._refresh_token,
                    },
                )
                resp.raise_for_status()
                data = resp.json()
                self._access_token = data["access_token"]
                self._refresh_token = data["refresh_token"]
                self._token_expiry = data.get("expiration", time.time() + 3600)
                LOG.info("HANA token refreshed")
            except Exception:
                LOG.warning("Token refresh failed, re-authenticating")
                await self.authenticate()

    async def _ensure_klatchat_token(self) -> None:
        if not (settings.hana_password_klatchat or "").strip():
            await self._ensure_token()
            return
        if not self._klatchat_access_token or time.time() >= self._klatchat_token_expiry - 60:
            try:
                resp = await self._client.post(
                    f"{self._base}/auth/refresh",
                    json={
                        "access_token": self._klatchat_access_token,
                        "refresh_token": self._klatchat_refresh_token,
                    },
                )
                resp.raise_for_status()
                data = resp.json()
                self._klatchat_access_token = data["access_token"]
                self._klatchat_refresh_token = data["refresh_token"]
                self._klatchat_token_expiry = data.get("expiration", time.time() + 3600)
                LOG.info("HANA klatchat token refreshed")
            except Exception:
                LOG.warning("Klatchat token refresh failed, re-authenticating")
                await self.authenticate_klatchat()

    @property
    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self._access_token}",
            "Content-Type": "application/json",
        }

    def _headers_klatchat(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self._klatchat_access_token}",
            "Content-Type": "application/json",
        }

    def _headers_for_model(self, model_id: str) -> dict[str, str]:
        if self._uses_klatchat_model(model_id) and (settings.hana_password_klatchat or "").strip():
            return self._headers_klatchat()
        return self._headers

    async def _ensure_headers_for_model(self, model_id: str) -> dict[str, str]:
        if self._uses_klatchat_model(model_id) and (settings.hana_password_klatchat or "").strip():
            await self._ensure_klatchat_token()
            return self._headers_klatchat()
        await self._ensure_token()
        return self._headers

    def _parse_models_payload(self, data: dict[str, Any]) -> list[dict[str, Any]]:
        models: list[dict[str, Any]] = []
        for m in data.get("models", []):
            model_id = f"{m['name']}@{m['version']}"
            personas = []
            for p in m.get("personas", []):
                pname = p.get("persona_name", "")
                sp = p.get("system_prompt") or ""
                cache_key = f"{model_id}:{pname}"
                self._persona_cache[cache_key] = sp if sp else None
                personas.append({
                    "id": p.get("id", p.get("persona_name", "")),
                    "persona_name": pname,
                    "description": p.get("description"),
                    "system_prompt": p.get("system_prompt"),
                    "enabled": p.get("enabled", True),
                })
            models.append({
                "name": m["name"],
                "version": m["version"],
                "model_id": model_id,
                "personas": personas,
            })
        return models

    async def _merge_direct_vllm_security_models(
        self, models: list[dict[str, Any]], seen: set[str]
    ) -> None:
        """Merge models from OpenAI-compatible GET /v1/models (NeonGeckoCom/brainforge-webapp pattern)."""
        base = (settings.neon_security_vllm_base_url or "").strip().rstrip("/")
        key = (settings.hana_password_klatchat or "").strip()
        if not base or not key:
            return
        url = f"{base}/v1/models"
        try:
            resp = await self._client.get(
                url,
                headers={"Authorization": f"Bearer {key}"},
            )
            if resp.status_code != 200:
                LOG.warning("Neon direct vLLM %s -> %s", url, resp.status_code)
                return
            payload = resp.json()
            added = 0
            for o in payload.get("data", []) or []:
                mid = (o.get("id") or "").strip()
                if not mid or "@" not in mid:
                    continue
                if mid in seen:
                    continue
                name, version = mid.split("@", 1)
                vanilla = {
                    "id": "vanilla",
                    "persona_name": "vanilla",
                    "description": None,
                    "system_prompt": None,
                    "enabled": True,
                }
                self._persona_cache[f"{mid}:vanilla"] = None
                models.append({
                    "name": name,
                    "version": version,
                    "model_id": mid,
                    "personas": [vanilla],
                })
                seen.add(mid)
                added += 1
            if added:
                LOG.info("Merged %s model(s) from direct vLLM %s", added, base)
            # region agent log
            try:
                with open(r"c:\Users\dream\CCAI-Demo-FEAT_Config\debug-c86901.log", "a", encoding="utf-8") as _df:
                    _df.write(
                        json.dumps(
                            {
                                "sessionId": "c86901",
                                "hypothesisId": "H5",
                                "location": "LLMChats3/hana_client._merge_direct_vllm",
                                "message": "direct_vllm_models",
                                "data": {
                                    "app": "LLMChats3",
                                    "url": url,
                                    "http_status": resp.status_code,
                                    "added_count": added,
                                },
                                "timestamp": int(time.time() * 1000),
                            }
                        )
                        + "\n"
                    )
            except Exception:
                pass
            # endregion
        except Exception as exc:
            LOG.warning("Neon direct vLLM model merge failed: %s", exc)

    async def _enrich_security_personas_from_hana(self, models: list[dict[str, Any]]) -> None:
        """Replace Security personas with HANA get_personas when the server allows (persona prompts live on HANA)."""
        for m in models:
            mid = m.get("model_id") or ""
            if "security" not in mid.lower():
                continue
            try:
                plist = await self.get_personas(mid)
                if plist:
                    m["personas"] = plist
                    for p in plist:
                        pname = p.get("persona_name", "")
                        sp = p.get("system_prompt") or ""
                        self._persona_cache[f"{mid}:{pname}"] = sp if sp else None
                    LOG.info("Enriched Security personas from HANA get_personas for %s", mid)
            except Exception as exc:
                LOG.debug("HANA get_personas enrichment skipped for %s: %s", mid, exc)

    async def _ensure_security_model_stub_if_missing(self, models: list[dict[str, Any]]) -> None:
        """If vLLM merge failed (401) and HANA supplement failed, still list Security so the UI can show it."""
        sid = "BrainForge/Security@2026.03.18"
        wanted = [x.strip() for x in (settings.hana_neon_model_supplement_ids or "").split(",") if x.strip()]
        if not any((w == sid or ("security" in w.lower() and "@" in w)) for w in wanted):
            return
        if any((m.get("model_id") == sid) for m in models):
            return
        try:
            plist = await self.get_personas(sid)
            name, ver = sid.split("@", 1)
            for p in plist or []:
                pname = p.get("persona_name", "")
                sp = p.get("system_prompt") or ""
                self._persona_cache[f"{sid}:{pname}"] = sp if sp else None
            models.append({
                "name": name,
                "version": ver,
                "model_id": sid,
                "personas": plist or [],
            })
            LOG.info("Security model added via HANA get_personas (stub path)")
        except Exception as exc:
            LOG.warning(
                "Security model not in HANA/vLLM responses (%s); adding minimal stub entry.",
                exc,
            )
            vanilla = {
                "id": "vanilla",
                "persona_name": "vanilla",
                "description": "Set HANA_KLATCHAT_PASSWORD to the 4090-x1-3 OpenAI API key (same as HF Space) so vLLM discovery works; persona prompts come from HANA when allowed.",
                "system_prompt": None,
                "enabled": True,
            }
            self._persona_cache[f"{sid}:vanilla"] = None
            models.append({
                "name": "BrainForge/Security",
                "version": "2026.03.18",
                "model_id": sid,
                "personas": [vanilla],
            })

    async def get_models(self) -> list[dict[str, Any]]:
        await self._ensure_token()
        resp = await self._client.post(
            f"{self._base}/brainforge/get_models",
            headers=self._headers,
            json={},
        )
        resp.raise_for_status()
        models = self._parse_models_payload(resp.json())
        seen = {m["model_id"] for m in models}

        if (settings.hana_password_klatchat or "").strip() and (settings.neon_security_vllm_base_url or "").strip():
            await self._merge_direct_vllm_security_models(models, seen)

        await self._append_supplement_models(models)
        await self._enrich_security_personas_from_hana(models)
        await self._ensure_security_model_stub_if_missing(models)
        # region agent log
        try:
            mids = [m.get("model_id", "") for m in models]
            with open(r"c:\Users\dream\CCAI-Demo-FEAT_Config\debug-c86901.log", "a", encoding="utf-8") as _df:
                _df.write(
                    json.dumps(
                        {
                            "sessionId": "c86901",
                            "hypothesisId": "H3",
                            "location": "LLMChats3/hana_client.get_models",
                            "message": "merged_models",
                            "data": {
                                "app": "LLMChats3",
                                "model_count": len(models),
                                "has_security_in_list": any("security" in (x or "").lower() for x in mids),
                                "model_ids_tail": mids[-8:],
                            },
                            "timestamp": int(time.time() * 1000),
                        }
                    )
                    + "\n"
                )
        except Exception:
            pass
        # endregion
        return models

    async def get_personas(self, model_id: str) -> list[dict[str, Any]]:
        """Fetch personas for a model_id (used when get_models omits a model)."""
        hdrs = await self._ensure_headers_for_model(model_id)
        resp = await self._client.post(
            f"{self._base}/brainforge/get_personas",
            headers=hdrs,
            json={"model_id": model_id},
        )
        resp.raise_for_status()
        data = resp.json()
        out = []
        for p in data.get("personas", []):
            pname = p.get("persona_name", "")
            sp = p.get("system_prompt") or ""
            cache_key = f"{model_id}:{pname}"
            self._persona_cache[cache_key] = sp if sp else None
            out.append({
                "id": p.get("id", p.get("persona_name", "")),
                "persona_name": pname,
                "description": p.get("description"),
                "system_prompt": p.get("system_prompt"),
                "enabled": p.get("enabled", True),
            })
        return out

    async def _append_supplement_models(self, models: list[dict[str, Any]]) -> None:
        """Merge models listed in settings but missing from get_models (HANA may omit some)."""
        raw = (settings.hana_neon_model_supplement_ids or "").strip()
        extras = [x.strip() for x in raw.split(",") if x.strip()]
        seen = {m["model_id"] for m in models}
        for mid in extras:
            if mid in seen:
                continue
            if "@" not in mid:
                LOG.warning("Invalid supplement model_id (expected name@version): %s", mid)
                continue
            try:
                personas = await self.get_personas(mid)
                name, version = mid.split("@", 1)
                models.append({
                    "name": name,
                    "version": version,
                    "model_id": mid,
                    "personas": personas,
                })
                seen.add(mid)
                LOG.info("Merged supplement Neon model from get_personas: %s", mid)
            except Exception as exc:
                LOG.debug("Supplement Neon model %s not merged: %s", mid, exc)

    def get_persona_system_prompt(self, model_id: str, persona_name: str) -> str | None:
        """Look up a persona's built-in system_prompt from the cache."""
        return self._persona_cache.get(f"{model_id}:{persona_name}")

    async def get_inference(
        self,
        query: str,
        model_id: str,
        persona_name: str,
        system_prompt: str | None = None,
        history: list[tuple[str, str]] | None = None,
        temperature: float = 0.7,
        max_tokens: int = 1024,
    ) -> dict[str, Any]:
        hdrs = await self._ensure_headers_for_model(model_id)
        hist = [[role, content] for role, content in (history or [])]

        persona_payload: dict[str, Any] = {"persona_name": persona_name}
        if system_prompt:
            persona_payload["system_prompt"] = system_prompt

        body = {
            "query": query,
            "history": hist,
            "persona": persona_payload,
            "model": model_id,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "extra_body": {},
            "llm_name": model_id.split("@")[0] if "@" in model_id else model_id,
            "llm_revision": model_id.split("@")[1] if "@" in model_id else "",
        }

        t0 = time.time()
        resp = await self._client.post(
            f"{self._base}/brainforge/get_inference",
            headers=hdrs,
            json=body,
        )
        elapsed = time.time() - t0
        resp.raise_for_status()
        data = resp.json()
        return {
            "response": data.get("response", ""),
            "elapsed_seconds": round(elapsed, 2),
            "finish_reason": data.get("finish_reason", "stop"),
        }

    async def close(self) -> None:
        await self._client.aclose()


hana_client = HanaClient()
