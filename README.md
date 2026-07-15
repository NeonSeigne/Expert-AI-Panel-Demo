---
title: Co-Panel
emoji: 🤝
colorFrom: blue
colorTo: purple
sdk: docker
app_port: 7860
hf_oauth: true
hf_oauth_scopes:
  - read-repos
pinned: false
---

# Co-Panel

**Co-Panel** is a collaborative AI panel demo built on Neon.ai's patented
group-discussion technology (Collaborative Conversational AI). Up to 9 participants (any mix of AI personas,
human-defined "expert" personas, or - in the future - real humans, agents,
tools, or sensors) hold a structured group conversation facilitated by a
neutral **Orchestrator**, with the goal of reaching a real group decision
the way a thoughtful human meeting would.

This repo descends from
[NeonClary/LLMChats3](https://github.com/NeonClary/LLMChats3) and reuses
its color scheme, branding assets, settings menu structure, and chat formatting
verbatim. The multi-participant orchestration, expert-persona modal,
participant sidebar, and table view are layered on top.

## Architecture (one-pager)

- **Frontend** (React 19, react-markdown, lucide-react) - lives in
  `frontend/`. Talks SSE to the backend.
- **Backend** (FastAPI, httpx) - lives in `backend/`. Routes:
  - `GET /api/personas` — Neon HANA personas (vanilla/RAG filtered,
    tagged Neon), YAML-configured extras from `persona_config.yaml`
    (with tags), plus a `tags` list for directory tabs.
  - `GET/POST/DELETE /api/personas/{id}/documents` — per-persona RAG
    document CRUD (Chroma under `data/persona_rag/`).
  - `GET /api/knowledge/status` — whether Tavily Web-Search is configured.
  - `GET /api/demo-questions` — the bank of 10 long-context demo prompts.
  - `POST /api/chat/start` — kicks off a Co-Panel session and returns SSE.
  - `POST /api/chat/{id}/continue?reason=…` — resumes a paused session.
  - `GET  /api/chat/{id}/export?fmt=txt|md|csv-table` — exports.
  - `GET  /api/chat/{id}/table` — JSON for the table view.
- **Orchestrator state machine** — six phases (Initial Opinions,
  Critique x2, Status Assessment, Finalization, Consensus, Closure)
  with two failsafes (60+20 messages, 100+50 orchestrator calls) and
  per-participant on-demand context summarization.

## Co-Panel Phase Overview

1. **Initial Opinions.** Each participant offers an independent first
   opinion. The orchestrator builds a per-participant **Credential
   Summary** in the background.
2. **Critique x 2.** Each participant gets two turns to critique
   others, ask follow-ups, and revise. After Phase 2 the Credential
   Summary is refreshed.
3. **Status Assessment.** The orchestrator either proceeds or runs
   targeted follow-ups (max 3 iterations).
4. **Finalization.** Each participant either revises their own opinion
   or endorses another's.
5. **Consensus Gathering.** Allied participants advocate, solo
   participants seek allies / switch / propose compromises. The
   orchestrator routes addressed-to messages.
6. **Closure.** Majority-report (with weighted dissent), or
   unaddressed-factor probe + retry, or no-consensus report.

Thinking traces (`<think>`, `<reasoning>`, etc.) are stripped from every
LLM response in `backend/app/utils/sanitize.py` before being stored,
displayed, or fed back to the orchestrator/summarizer/Credential builder.

## Quick Start (local development)

### Shared secrets (`shared.env`)

This project supports a cross-project secrets file (same pattern as other Neon
Cursor repos). Place API keys in `shared.env` **outside the repo** — never
commit it. The backend loads it automatically before the project `.env`:

1. `SHARED_ENV_PATH` or `SHARED_ENV_FILE` if set in the shell
2. `~/.secrets/shared.env`
3. `~/Downloads/shared.env`

Project `.env` overrides any duplicate keys from `shared.env`.

```bash
# Optional: only project-specific overrides (orchestrator model, CORS, etc.)
cp .env.example .env

# Or use the dev script (auto-detects shared.env + starts both servers)
./scripts/dev-local.sh
```

Manual start:

```bash
# Backend
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Frontend (separate terminal)
cd frontend
npm install
npm start
```

## Docker

```bash
cp .env.example .env
# Optional: point Docker at your shared secrets file
export SHARED_ENV_FILE="$HOME/Downloads/shared.env"
docker compose up --build
# Open http://localhost:7860
```

## HuggingFace Spaces Deployment

Deployed as a Docker Space (`app_port: 7860`).

Required Space Secrets:

- `HANA_USERNAME`, `HANA_PASSWORD` — Neon HANA credentials.
- `HANA_KLATCHAT_PASSWORD` (optional) — BrainForge/Security vLLM access.
- Provider keys: `OPENAI_API_KEY`, `GEMINI_API_KEY`, `FIREWORKS_API_KEY`,
  `TOGETHER_API_KEY`, `MISTRAL_API_KEY`.
- `HF_RATE_LIMIT_DAILY=30` — daily per-IP cap (defaults to 30; org
  members are unlimited).
- `HF_RATE_LIMIT_ORG=neongeckocom` — bypass org name.
- `SESSION_SECRET` — cookie session secret for OAuth.

## Features

- **Participant dropdown** in the header with three sections (Neon /
  Extra / Expert) and a `Create Expert Persona...` shortcut.
- **Participant sidebar** with on/off slider per participant; flipping
  off does not deselect, and a `Remove` button appears for actually
  dropping someone from the conversation.
- **Settings menu** with searchable orchestrator-model and summarizer-
  model pickers (summarizer defaults to "Same as Orchestrator"),
  a 3-9 max-participants stepper, per-participant model overrides, and
  the same display-options + downloads structure as LLMChats3.
- **Two failsafes** with explicit Continue buttons (60+20 messages,
  100+50 orchestrator calls).
- **Exports**: `.txt`, `.md`, RFC-4180 `.csv` table, JSON API log.
- **Table view** of the whole conversation with per-participant first /
  contribution / revised / final columns.
- **localStorage persistence** for expert personas, participant
  selection, on/off state, model assignments, orchestrator/summarizer
  picks, max-participants, and per-persona Web-Search / Documents
  toggles.
- **Persona config** (`backend/persona_config.yaml`) for tagged
  non-HANA personas (Finance, Technology, Security, …). HANA personas
  are tagged **Neon**. Directory tabs follow tags (teams groundwork).
- **Per-persona RAG** via Chroma under `backend/data/persona_rag/` —
  Manage documents from the directory detail pane. Set
  `TAVILY_API_KEY` for optional Web-Search enrichment on turns.
- **HuggingFace OAuth** with `neongeckocom` org bypass.
