#!/usr/bin/env bash
# One-time FieldTwin to Bangi migration on the existing private server.
set -euo pipefail
cd "$(dirname "$0")/.."
remote=fieldtwin-staging
ssh_config=.runtime/ncp/ssh_config
# Run scripts/backup-staging.mjs before this script and load the release images first.
ssh -F "$ssh_config" "$remote" 'set -eu
cd /opt/fieldtwin
docker image inspect fieldtwin-api:0.3.1 fieldtwin-web:0.3.1 >/dev/null
if [ -e rollback-before-bangi/compose.yaml ]; then
  echo "Bangi migration was already prepared. Preserve its rollback snapshot and use the upgrade procedure." >&2
  exit 1
fi
mkdir -p rollback-before-bangi
chmod 700 rollback-before-bangi
cp -p infra/single-vm/compose.yaml infra/single-vm/compose.micro.yaml infra/single-vm/tls.conf rollback-before-bangi/
cp -p runtime/compose.env runtime/api.env rollback-before-bangi/
./dc stop ai fieldtwin-api web
./dc rm -f ai'
tar -cf - infra/single-vm/compose.yaml infra/single-vm/compose.micro.yaml infra/single-vm/tls.conf scripts/grant-bangi.sql | ssh -F "$ssh_config" "$remote" 'cd /opt/fieldtwin && tar -xf -'
# The key travels inside the already authenticated SSH channel; never in process arguments.
ssh -F "$ssh_config" "$remote" 'umask 077; cat > /opt/fieldtwin/runtime/seoul.env' < .runtime/bangi/seoul.env
ssh -F "$ssh_config" "$remote" 'set -eu
cd /opt/fieldtwin
python3 - <<"PY"
from pathlib import Path
p=Path("runtime/api.env")
lines=[x for x in p.read_text().splitlines() if not x.startswith(("SEOUL_API_KEY=","SEOUL_BIKE_API_BASE="))]
p.write_text("\n".join(lines)+"\n"+Path("runtime/seoul.env").read_text())
p.chmod(0o600)
p=Path("runtime/compose.env")
lines=[x for x in p.read_text().splitlines() if not x.startswith(("API_IMAGE=","WEB_IMAGE="))]
p.write_text("\n".join(lines)+"\nAPI_IMAGE=fieldtwin-api:0.3.1\nWEB_IMAGE=fieldtwin-web:0.3.1\n")
p.chmod(0o600)
PY
./dc run --rm migrate-api
./dc exec -T db psql -X -v ON_ERROR_STOP=1 -U postgres -d fieldtwin_staging < scripts/grant-bangi.sql
./dc up -d fieldtwin-api web
./dc ps'
