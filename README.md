---
title: AI Conversations
emoji: 💬
colorFrom: blue
colorTo: purple
sdk: docker
app_port: 7860
hf_oauth: true
hf_oauth_scopes:
  - read-repos
pinned: false
---

# AI Conversations (LLMChats3)

A web app that lets two LLMs have a natural conversation. Select two LLMs, configure their personas, and watch them chat — complete with an orchestrator that manages natural conversation endings.

## Quick Start (local development)

```bash
# 1. Clone and set up environment
cp .env.example .env
# Edit .env with your API keys

# 2. Backend
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# 3. Frontend (in a separate terminal)
cd frontend
npm install
npm start
```

## Docker

```bash
cp .env.example .env
# Edit .env with your API keys
docker compose up --build
```

## HuggingFace Spaces Deployment

This app is deployed as a Docker Space at [neongeckocom/AI_Conversations](https://huggingface.co/spaces/neongeckocom/AI_Conversations). API keys are stored as Space Secrets.

Rate limiting: 20 conversations/day per IP for anonymous users. Sign in with HuggingFace as a neongeckocom org member for unlimited access.

## Features

- Select any two LLMs from multiple providers (OpenAI, Gemini, Fireworks, Together, Neon)
- Configure rich personas with names, profiles, identity prompts, and writing samples
- Structured or freeform persona input modes with file upload support
- Watch LLMs converse naturally with an orchestrator managing conversation flow
- Automatic conversation ending detection with graceful wrap-up
- Export chats as .txt or .md, plus full API logs for developers
- HuggingFace OAuth integration with org-based rate limiting