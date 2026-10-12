#!/usr/bin/env bash
# Run on the existing NCP VM after backup/restore verification and docker load.
set -euo pipefail
cd /opt/fieldtwin
release="${1:?Usage: upgrade-bangi.sh RELEASE_TAG}"
[[ "$release" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || exit 2
docker image inspect "fieldtwin-api:$release" "fieldtwin-web:$release" >/dev/null
umask 077
rollback="rollback-bangi-$(date +%Y%m%d-%H%M%S)"
mkdir "$rollback"
cp -p runtime/compose.env "$rollback/compose.env"
restore() {
  cp -p "$rollback/compose.env" runtime/compose.env
  ./dc up -d fieldtwin-api web
}
trap restore ERR
# The 1GB VM needs the application stopped while the migration JVM runs.
./dc stop web fieldtwin-api
python3 - "$release" <<'PY'
from pathlib import Path
import sys
p=Path('runtime/compose.env')
lines=[s for s in p.read_text().splitlines() if not s.startswith(('API_IMAGE=','WEB_IMAGE='))]
p.write_text('\n'.join(lines)+f'\nAPI_IMAGE=fieldtwin-api:{sys.argv[1]}\nWEB_IMAGE=fieldtwin-web:{sys.argv[1]}\n')
PY
./dc run --rm -T migrate-api </dev/null
./dc up -d fieldtwin-api web
trap - ERR
printf 'Release %s started. Previous image references: %s/compose.env\n' "$release" "$rollback"
