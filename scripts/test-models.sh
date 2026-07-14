#!/usr/bin/env bash
# Smoke-test every model in the settings picker against live APIs.
# Requires API keys in shared.env (~/.secrets/shared.env or ~/Downloads/shared.env).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/backend"

if [[ -d venv ]]; then
  # shellcheck disable=SC1091
  source venv/bin/activate
fi

export RUN_LIVE_MODEL_TESTS=1
# Optional: MODEL_TEST_FILTER=gemini MODEL_TEST_KINDS=provider

echo "Running live model smoke tests (this may take several minutes)..."
python -m pytest tests/test_model_health.py -m live -v -s "$@"
