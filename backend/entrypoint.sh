#!/usr/bin/env sh
set -e

# TRD Section 8.4 wants migrations to be a visible, blocking step rather than
# something the app retries quietly on startup. Locally that is this line; in
# production RUN_MIGRATIONS=false and a dedicated one-off `migrate` service runs
# them first, so a failed migration stops the deploy instead of leaving an API
# running against a schema it does not match.
if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "[entrypoint] applying database migrations..."
  alembic upgrade head
else
  echo "[entrypoint] skipping migrations (RUN_MIGRATIONS=false)"
fi

echo "[entrypoint] starting API on ${API_HOST:-0.0.0.0}:${API_PORT:-8000}"
exec uvicorn main:app --host "${API_HOST:-0.0.0.0}" --port "${API_PORT:-8000}" "$@"
