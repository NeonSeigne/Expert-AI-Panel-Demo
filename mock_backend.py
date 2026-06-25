"""Mock CCAI backend for UI rendering/screenshots ONLY.

Serves the exact JSON shapes the frontend expects (derived from the real
backend's api/personas.py, api/models.py, extra_personas.py, demo_questions.json)
plus a canned SSE panel for /api/chat/start so the multi-persona discussion UI
can be screenshotted without any real LLM/HANA access. Not used in production.
"""
import json, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PROVIDERS = [
    {"id": "openai", "name": "OpenAI", "models": [
        {"id": "gpt-5.4", "name": "GPT-5.4", "params": "Undisclosed"},
        {"id": "gpt-4.1", "name": "GPT-4.1", "params": "Undisclosed"},
        {"id": "gpt-4o", "name": "GPT-4o", "params": "~200B"},
        {"id": "gpt-4o-mini", "name": "GPT-4o Mini", "params": "~8B"},
        {"id": "o4-mini", "name": "o4-Mini", "params": "Undisclosed"},
    ]},
    {"id": "gemini", "name": "Google Gemini", "models": [
        {"id": "gemini-2.5-flash", "name": "Gemini 2.5 Flash", "params": "Undisclosed"},
        {"id": "gemini-2.5-pro", "name": "Gemini 2.5 Pro", "params": "Undisclosed"},
    ]},
    {"id": "mistral", "name": "Mistral", "models": [
        {"id": "devstral-2512", "name": "Devstral2", "params": "123B"},
        {"id": "mistral-small-2603", "name": "Mistral Small 4", "params": "119B"},
    ]},
    {"id": "meta", "name": "Meta Llama", "models": [
        {"id": "meta-llama/Llama-3.3-70B-Instruct-Turbo", "name": "Llama 3.3 70B Turbo", "params": "70B"},
    ]},
    {"id": "deepseek", "name": "DeepSeek", "models": [
        {"id": "accounts/fireworks/models/deepseek-v3p1", "name": "DeepSeek V3.1", "params": "671B"},
    ]},
]

NEON_MODELS = [
    {"model_id": "BrainForge/Security@2026.03.18", "name": "BrainForge/Security",
     "personas": [
        {"persona_name": "Athena", "enabled": True, "system_prompt": "You are Athena, a strategic advisor."},
        {"persona_name": "Vanilla", "enabled": True, "system_prompt": "Plain assistant."},
     ]},
]

NEON_PERSONAS = [
    {"participant_id": "neon:BrainForge/Security@2026.03.18:Athena", "kind": "neon",
     "name": "Athena (Strategic Advisor)", "model_display": "Security",
     "default_model_id": "neon:BrainForge/Security@2026.03.18:Athena",
     "description": "Strategic advisor persona", "role_prompt": "You are Athena."},
]

EXTRA = [
    {"participant_id": "extra_pragmatic_generalist", "name": "Pragmatic Finance Expert",
     "default_model_id": "gpt-5.4", "model_display": "gpt-5.4", "kind": "extra", "role_prompt": "..."},
    {"participant_id": "extra_skeptical_critic", "name": "Skeptical Philosopher",
     "default_model_id": "gemini-2.5-flash", "model_display": "gemini-2.5-flash", "kind": "extra", "role_prompt": "..."},
    {"participant_id": "extra_empathetic_humanist", "name": "Empathetic Historian",
     "default_model_id": "devstral-2512", "model_display": "devstral-2512", "kind": "extra", "role_prompt": "..."},
    {"participant_id": "extra_data_driven_analyst", "name": "Data-Driven Geologist",
     "default_model_id": "meta-llama/Llama-3.3-70B-Instruct-Turbo",
     "model_display": "Llama-3.3-70B-Instruct-Turbo", "kind": "extra", "role_prompt": "..."},
    {"participant_id": "extra_elena_financial_strategist", "name": "Elena — Financial Strategist",
     "default_model_id": "gpt-4.1", "model_display": "gpt-4.1", "kind": "extra", "role_prompt": "..."},
    {"participant_id": "extra_marcus_technology_strategist", "name": "Marcus — Technology Strategist",
     "default_model_id": "mistral-small-2603",
     "model_display": "mistral-small-2603", "kind": "extra", "role_prompt": "..."},
    {"participant_id": "extra_amira_security_advisor", "name": "Dr. Amira — Security & Privacy Advisor",
     "default_model_id": "neon:BrainForge/Security@2026.05.13:CybersecurityExpert",
     "model_display": "CybersecurityExpert", "kind": "extra", "role_prompt": "..."},
]

DEMO_QUESTIONS = json.load(open("backend/app/data/demo_questions.json"))["questions"]

FORMATS = {
    "structures": [
        {"id": "collaborative", "name": "Collaborative Discussion", "description": "Structured group reasoning toward consensus."},
        {"id": "roberts_rules", "name": "Robert's Rules", "description": "Formal motion/second/vote procedure."},
    ],
    "decisions": [
        {"id": "consensus", "name": "Consensus", "description": "Seek agreement; majority report with dissent."},
        {"id": "majority", "name": "Majority Vote", "description": "Simple majority."},
        {"id": "ranked_choice", "name": "Ranked Choice", "description": "Ranked-choice tally."},
    ],
    "default_structure_id": "collaborative",
    "default_decision_id": "consensus",
}

def sse(event, data):
    return f"event: {event}\ndata: {json.dumps(data)}\n\n".encode()

class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def _json(self, obj, code=200):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)
    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
    def do_GET(self):
        p = self.path.split("?")[0]
        if p == "/api/models": return self._json({"neon_models": NEON_MODELS, "providers": PROVIDERS})
        if p == "/api/personas": return self._json({"neon": NEON_PERSONAS, "extra": EXTRA})
        if p == "/api/demo-questions": return self._json({"questions": DEMO_QUESTIONS})
        if p == "/api/chat/orchestrator": return self._json({"model_id": "gpt-4o-mini"})
        if p == "/api/chat/speed-priority": return self._json({"enabled": False})
        if p == "/api/chat/conversation-formats": return self._json(FORMATS)
        if p == "/api/auth/status": return self._json({"logged_in": False, "is_org_member": False, "remaining_conversations": 30})
        if p == "/api/rate-limit/status": return self._json({"remaining": 30, "daily_limit": 30})
        return self._json({}, 404)
    def do_PUT(self):
        self._read()
        if self.path.startswith("/api/chat/orchestrator"): return self._json({"model_id": "gpt-4o-mini"})
        if self.path.startswith("/api/chat/speed-priority"): return self._json({"enabled": False})
        return self._json({})
    def do_PATCH(self):
        self._read(); return self._json({})
    def _read(self):
        n = int(self.headers.get("Content-Length", 0) or 0)
        return self.rfile.read(n) if n else b""
    def do_POST(self):
        raw = self._read()
        try: body = json.loads(raw or b"{}")
        except Exception: body = {}
        if self.path.startswith("/api/chat/suggest-model"):
            return self._json({"recommended_model_id": "gemini-2.5-flash",
                "rationale": "A philosophy-leaning critic benefits from a model with strong reasoning and concise argumentation; Gemini 2.5 Flash also diversifies the panel away from the GPT family already present."})
        if self.path.startswith("/api/chat/generate-role-freeform") or self.path.startswith("/api/chat/generate-role"):
            return self._json({"role_prompt": "You are " + (body.get("name") or "an expert") + ". (mock-generated role prompt for UI rendering)"})
        if self.path.startswith("/api/chat/auto-select-participants"):
            cands = body.get("candidates", [])
            return self._json({"selected": [c["participant_id"] for c in cands[:body.get("count",3)]],
                               "rationale": "Picked the most topically relevant participants (mock)."})
        if self.path.startswith("/api/chat/start"):
            return self._sse_panel(body)
        return self._json({})
    def _sse_panel(self, body):
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        parts = body.get("participants", [])
        if len(parts) < 2:
            parts = [{"participant_id": "extra_pragmatic_generalist", "name": "Pragmatic Finance Expert"},
                     {"participant_id": "extra_skeptical_critic", "name": "Skeptical Philosopher"},
                     {"participant_id": "extra_empathetic_humanist", "name": "Empathetic Historian"}]
        q = body.get("question", "the question")
        sid = "mock-" + str(int(time.time()))
        roster = [{"participant_id": p["participant_id"], "name": p["name"],
                   "model_display": p.get("name")} for p in parts]
        self.wfile.write(sse("session", {"session_id": sid, "participants": roster})); self.wfile.flush()
        self.wfile.write(sse("status", {"message": "Phase 1: Initial Opinions"})); self.wfile.flush()
        op = {
            parts[0]["name"]: f"On '{q[:50]}...', my first take is to weigh cost against benefit. The numbers have to clear a return-on-investment bar before anything else.",
            parts[1]["name"]: "I'd challenge the framing. Before we optimize, what assumption are we all making that nobody has examined? Let's pressure-test the premise.",
        }
        if len(parts) > 2:
            op[parts[2]["name"]] = "I want to center the human stakes. Whoever is on the receiving end of this decision matters as much as the spreadsheet."
        for i, p in enumerate(parts):
            mid = f"m{i}"
            txt = op.get(p["name"], "Here is my initial opinion, grounded in my area of expertise.")
            self.wfile.write(sse("message", {"message_id": mid, "role": "participant",
                "speaker_id": p["participant_id"], "speaker_name": p["name"],
                "text": txt, "phase": "initial_opinions", "elapsed_seconds": 2.1 + i,
                "timestamp": time.time()})); self.wfile.flush()
        self.wfile.write(sse("orchestrator", {"message_id": "o1", "role": "orchestrator",
            "kind": "status", "text": "All participants have given initial opinions. Moving to the critique phase, where each will respond to the others.",
            "timestamp": time.time()})); self.wfile.flush()
        self.wfile.write(sse("message", {"message_id": "m10", "role": "participant",
            "speaker_id": parts[1]["participant_id"], "speaker_name": parts[1]["name"],
            "text": "Responding directly to the finance framing: ROI is necessary but not sufficient. A positive ROI on paper can still be the wrong call if it erodes trust.",
            "addressed_to": parts[0]["participant_id"], "replying_to": [parts[0]["participant_id"]],
            "phase": "critique", "elapsed_seconds": 3.4, "timestamp": time.time()})); self.wfile.flush()
        self.wfile.write(sse("orchestrator", {"message_id": "o2", "role": "orchestrator",
            "kind": "majority_report",
            "text": "**Majority Report.** The panel converges on a staged approach: validate ROI on a small pilot first, while explicitly protecting the human/trust factors the Historian raised. One participant dissents, preferring a faster full commitment.",
            "timestamp": time.time()})); self.wfile.flush()
        self.wfile.write(sse("system", {"text": "End of Chat"})); self.wfile.flush()
        self.wfile.write(sse("done", {})); self.wfile.flush()

if __name__ == "__main__":
    print("Mock backend on :8000")
    ThreadingHTTPServer(("127.0.0.1", 8000), H).serve_forever()
