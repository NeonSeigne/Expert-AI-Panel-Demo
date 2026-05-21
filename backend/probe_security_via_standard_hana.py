"""One-shot probe: does the standard HANA path now serve BrainForge/Security?

Intentionally bypasses the existing HanaClient (which still has klatchat
detection and direct-vLLM merging) and talks to HANA the same way we
talk to it for every OTHER Neon model:

  POST {hana_base_url}/auth/login           (with hana_username/hana_password only)
  POST {hana_base_url}/brainforge/get_models
  POST {hana_base_url}/brainforge/get_personas    (for Security)
  POST {hana_base_url}/brainforge/get_inference   (for CybersecurityExpert persona)

Each step's outcome is appended as one NDJSON line to debug-896623.log
so we can confirm/reject H1-H5 from runtime evidence before changing
production code.

Run with:
    docker compose exec app python probe_security_via_standard_hana.py
"""
from __future__ import annotations

import json
import os
import time
from pathlib import Path

import httpx

LOG_PATH = Path("/home/user/app/debug-896623.log")
SESSION = "896623"
SECURITY_MODEL_ID = "BrainForge/Security@2026.03.18"


def _emit(hypothesis: str, message: str, data: dict) -> None:
    """Append one NDJSON line to the debug log. Never raises."""
    payload = {
        "sessionId": SESSION,
        "runId": "probe-security-standard",
        "hypothesisId": hypothesis,
        "location": "backend/probe_security_via_standard_hana.py",
        "message": message,
        "data": data,
        "timestamp": int(time.time() * 1000),
    }
    try:
        LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
        with LOG_PATH.open("a", encoding="utf-8") as f:
            f.write(json.dumps(payload) + "\n")
    except Exception as exc:
        print(f"log emit failed: {exc!r}")


def main() -> None:
    base = (os.environ.get("HANA_BASE_URL") or "https://hana.neonaialpha.com").rstrip("/")
    user = os.environ.get("HANA_USERNAME") or "guest"
    pwd = os.environ.get("HANA_PASSWORD") or ""

    _emit(
        "setup",
        "starting probe with standard HANA creds only",
        {
            "hana_base_url": base,
            "hana_username": user,
            "hana_password_set": bool(pwd),
            "hana_password_klatchat_set": bool(os.environ.get("HANA_KLATCHAT_PASSWORD") or os.environ.get("HANA_PASSWORD_KLATCHAT")),
            "vllm_api_key_set": bool(os.environ.get("VLLM_API_KEY")),
        },
    )

    with httpx.Client(timeout=60.0) as cli:
        # 1) Standard auth.
        try:
            r = cli.post(
                f"{base}/auth/login",
                json={"username": user, "password": pwd, "token_name": "ProbeSecurity", "client_id": "llm-chat-tool"},
            )
            ok = 200 <= r.status_code < 300
            data = r.json() if ok else {}
            token = data.get("access_token", "")
            _emit(
                "auth",
                "standard HANA /auth/login result",
                {
                    "status": r.status_code,
                    "ok": ok,
                    "username_returned": data.get("username"),
                    "has_access_token": bool(token),
                    "expiration": data.get("expiration"),
                },
            )
            if not ok or not token:
                print("Auth failed; aborting probe.")
                return
        except Exception as exc:
            _emit("auth", "standard HANA /auth/login raised", {"error": repr(exc)})
            return

        headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

        # 2) H1: does get_models include Security?
        try:
            r = cli.post(f"{base}/brainforge/get_models", headers=headers, json={})
            payload = r.json() if 200 <= r.status_code < 300 else {}
            models = payload.get("models", []) or []
            mids = [f"{m.get('name')}@{m.get('version')}" for m in models]
            security_entry = next(
                (m for m in models if (str(m.get("name") or "").lower() == "brainforge/security")
                 or ("security" in str(m.get("name") or "").lower())),
                None,
            )
            personas_in_security = []
            if security_entry:
                personas_in_security = [p.get("persona_name") for p in (security_entry.get("personas") or [])]
            _emit(
                "H1",
                "standard /brainforge/get_models result",
                {
                    "status": r.status_code,
                    "model_count": len(models),
                    "first_8_model_ids": mids[:8],
                    "all_model_ids_with_security": [m for m in mids if "security" in m.lower()],
                    "security_in_list": security_entry is not None,
                    "security_personas_in_get_models": personas_in_security,
                },
            )
        except Exception as exc:
            _emit("H1", "standard /brainforge/get_models raised", {"error": repr(exc)})

        # 3) H2: does get_personas for Security return personas with prompts?
        try:
            r = cli.post(f"{base}/brainforge/get_personas", headers=headers, json={"model_id": SECURITY_MODEL_ID})
            payload = r.json() if 200 <= r.status_code < 300 else {}
            personas = payload.get("personas", []) or []
            simplified = [
                {
                    "persona_name": p.get("persona_name"),
                    "has_system_prompt": bool((p.get("system_prompt") or "").strip()),
                    "system_prompt_chars": len((p.get("system_prompt") or "").strip()),
                    "enabled": p.get("enabled", True),
                }
                for p in personas
            ]
            _emit(
                "H2",
                "standard /brainforge/get_personas for Security",
                {
                    "status": r.status_code,
                    "model_id": SECURITY_MODEL_ID,
                    "persona_count": len(personas),
                    "personas": simplified,
                    "raw_body_preview": (r.text or "")[:400] if r.status_code != 200 else None,
                },
            )
            cyber = next(
                (p for p in personas if (p.get("persona_name") or "").lower() == "cybersecurityexpert"),
                None,
            )
        except Exception as exc:
            _emit("H2", "standard /brainforge/get_personas raised", {"error": repr(exc)})
            cyber = None

        # 4) H3: does get_inference work for CybersecurityExpert?
        persona_name = (cyber or {}).get("persona_name") if cyber else "CybersecurityExpert"
        system_prompt = (cyber or {}).get("system_prompt") or ""

        def _call_inference(model_id: str, persona: str, sp: str, label: str, hyp: str) -> None:
            persona_payload: dict = {"persona_name": persona}
            if sp:
                persona_payload["system_prompt"] = sp
            body = {
                "query": "In two short sentences, what is a zero-day vulnerability?" if "Security" in model_id
                         else "In one sentence, what is the capital of France?",
                "history": [],
                "persona": persona_payload,
                "model": model_id,
                "max_tokens": 120,
                "temperature": 0.3,
                "extra_body": {},
                "llm_name": model_id.split("@")[0] if "@" in model_id else model_id,
                "llm_revision": model_id.split("@")[1] if "@" in model_id else "",
            }
            try:
                t0 = time.time()
                r = cli.post(f"{base}/brainforge/get_inference", headers=headers, json=body)
                elapsed_s = round(time.time() - t0, 2)
                ok = 200 <= r.status_code < 300
                resp_body = r.json() if ok else {}
                response = (resp_body.get("response") or "").strip()
                _emit(
                    hyp,
                    f"standard /brainforge/get_inference [{label}]",
                    {
                        "status": r.status_code,
                        "ok": ok,
                        "elapsed_seconds": elapsed_s,
                        "model_id": model_id,
                        "persona_used": persona,
                        "system_prompt_included": bool(sp),
                        "response_chars": len(response),
                        "response_preview": response[:240] if response else None,
                        "finish_reason": resp_body.get("finish_reason"),
                        "raw_body_preview": (r.text or "")[:300] if not ok else None,
                    },
                )
            except Exception as exc:
                _emit(hyp, f"/brainforge/get_inference [{label}] raised", {"error": repr(exc)})

        # Production-shaped call: persona_name + system_prompt (cached from get_personas).
        _call_inference(SECURITY_MODEL_ID, persona_name, system_prompt, "Security/CybersecurityExpert", "H3")

        # Control: another Neon model with the same payload shape.
        # Pick the first non-Security model from get_models above. We refetch it cheaply.
        try:
            r = cli.post(f"{base}/brainforge/get_models", headers=headers, json={})
            models2 = r.json().get("models", []) if 200 <= r.status_code < 300 else []
            ctrl = None
            for m in models2:
                mid = f"{m.get('name')}@{m.get('version')}"
                if "security" in mid.lower():
                    continue
                # find any persona on this model
                for p in (m.get("personas") or []):
                    pname = p.get("persona_name") or ""
                    if pname:
                        ctrl = (mid, pname, (p.get("system_prompt") or ""))
                        break
                if ctrl:
                    break
            if ctrl:
                cmid, cpersona, csp = ctrl
                _call_inference(cmid, cpersona, csp, f"control:{cmid}/{cpersona}", "H3-ctrl")
            else:
                _emit("H3-ctrl", "no control model found", {})
        except Exception as exc:
            _emit("H3-ctrl", "control fetch raised", {"error": repr(exc)})

    _emit("done", "probe complete", {})


if __name__ == "__main__":
    main()
