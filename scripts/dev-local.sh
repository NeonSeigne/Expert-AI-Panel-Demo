#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export PATH="/opt/homebrew/bin:/opt/homebrew/opt/python@3.12/libexec/bin:$PATH"

echo "Starting Co-Panel local dev (hot reload enabled)"
echo "Project root: $ROOT"
echo ""

# Cross-project secrets (shared.env) — loaded by backend/app/config.py before .env
if [[ -n "${SHARED_ENV_PATH:-}" && -f "${SHARED_ENV_PATH}" ]]; then
  echo "Using shared secrets: $SHARED_ENV_PATH"
elif [[ -f "$HOME/.secrets/shared.env" ]]; then
  export SHARED_ENV_PATH="$HOME/.secrets/shared.env"
  echo "Using shared secrets: $SHARED_ENV_PATH"
elif [[ -f "$HOME/Downloads/shared.env" ]]; then
  export SHARED_ENV_PATH="$HOME/Downloads/shared.env"
  echo "Using shared secrets: $SHARED_ENV_PATH"
fi

if [[ ! -f "$ROOT/.env" ]]; then
  cp "$ROOT/.env.example" "$ROOT/.env"
  echo "Created .env from .env.example — project overrides only; API keys can live in shared.env."
fi

if [[ ! -f "$ROOT/frontend/.env.development" ]]; then
  echo "REACT_APP_API_URL=http://localhost:8000" > "$ROOT/frontend/.env.development"
fi

cleanup() {
  echo ""
  echo "Stopping dev servers..."
  jobs -p | xargs kill 2>/dev/null || true
}
trap cleanup EXIT INT TERM

cd "$ROOT/backend"
PYTHON="${PYTHON:-/opt/homebrew/bin/python3.12}"
if [[ ! -d venv ]]; then
  "$PYTHON" -m venv venv
  source venv/bin/activate
  pip install -r requirements.txt
else
  source venv/bin/activate
fi

echo "→ Backend: http://localhost:8000 (uvicorn --reload)"
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!

cd "$ROOT/frontend"
if [[ ! -d node_modules ]]; then
  npm install
fi

echo "→ Frontend: http://localhost:3000 (react-scripts start)"
BROWSER=none npm start &
FRONTEND_PID=$!

wait $BACKEND_PID $FRONTEND_PID
