#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
context="${FIELDTWIN_DOCKER_CONTEXT:-colima-fieldtwin}"
docker --context "$context" info >/dev/null
if ! docker --context "$context" image inspect fieldtwin-postgres:local >/dev/null 2>&1; then
  docker --context "$context" build -t fieldtwin-postgres:local infra/postgres
fi
if docker --context "$context" container inspect fieldtwin-db >/dev/null 2>&1; then
  docker --context "$context" start fieldtwin-db >/dev/null
else
  docker --context "$context" run -d --name fieldtwin-db --restart unless-stopped -p 127.0.0.1:55432:5432 -e POSTGRES_DB=fieldtwin -e POSTGRES_USER=fieldtwin -e POSTGRES_PASSWORD=fieldtwin-local-only -v fieldtwin-db:/var/lib/postgresql/data fieldtwin-postgres:local >/dev/null
fi
for i in {1..40}; do
  if docker --context "$context" exec fieldtwin-db pg_isready -U fieldtwin -d fieldtwin >/dev/null 2>&1; then
    if ! docker --context "$context" exec fieldtwin-db psql -U fieldtwin -d postgres -Atc "SELECT datname FROM pg_database WHERE datname='fieldtwin_bangi'" | rg -q fieldtwin_bangi; then
      docker --context "$context" exec fieldtwin-db createdb -U fieldtwin fieldtwin_bangi
    fi
    echo 'Bangi database ready on 127.0.0.1:55432'
    exit 0
  fi
  sleep 1
done
echo 'Database readiness timeout' >&2
exit 1
