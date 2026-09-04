#!/usr/bin/env sh
set -e

echo "[entrypoint] applying database migrations..."
alembic upgrade head

echo "[entrypoint] starting API on ${API_HOST:-0.0.0.0}:${API_PORT:-8000}"
exec uvicorn main:app --host "${API_HOST:-0.0.0.0}" --port "${API_PORT:-8000}" "$@"
