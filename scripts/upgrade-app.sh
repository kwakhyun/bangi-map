#!/usr/bin/env bash
# Existing single-VM release, with no schema or runtime-secret changes.
set -Eeuo pipefail
cd /opt/fieldtwin
release="${1:?Usage: upgrade-app.sh RELEASE_TAG}"
[[ "$release" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || exit 2
docker image inspect "fieldtwin-web:$release" "fieldtwin-api:$release" >/dev/null
test -f runtime/tls/verification-ca.crt
./dc config --quiet
umask 077
rollback="rollback-app-$(date +%Y%m%d-%H%M%S)"
mkdir "$rollback"
cp -p runtime/compose.env "$rollback/compose.env"
cp -p dc "$rollback/dc"
cat > "$rollback/restore.sh" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
snapshot="$(cd "$(dirname "$0")" && pwd)"
cd /opt/fieldtwin
./dc stop web fieldtwin-api
cp -p "$snapshot/compose.env" runtime/compose.env
cp -p "$snapshot/dc" dc
./dc up -d --no-deps fieldtwin-api web
SH
chmod 700 "$rollback/restore.sh"
restore_on_error() {
  original_status=$?
  trap - ERR
  printf 'Release failed. Restoring %s\n' "$rollback" >&2
  bash "$rollback/restore.sh" || printf 'Automatic rollback failed; run %s/restore.sh\n' "$rollback" >&2
  exit "$original_status"
}
trap restore_on_error ERR
# Avoid mixed lock implementations and overlapping JVMs on the 1 GB VM.
./dc stop web fieldtwin-api
python3 - "$release" <<'PY'
from pathlib import Path
import sys
p=Path('runtime/compose.env')
lines=[line for line in p.read_text().splitlines() if not line.startswith(('WEB_IMAGE=','API_IMAGE='))]
p.write_text('\n'.join(lines)+f'\nWEB_IMAGE=fieldtwin-web:{sys.argv[1]}\nAPI_IMAGE=fieldtwin-api:{sys.argv[1]}\n')
PY
./dc config --quiet
./dc up -d --no-deps fieldtwin-api web
healthy=false
for attempt in $(seq 1 40); do
  if curl --max-time 4 --fail --silent --cacert runtime/tls/verification-ca.crt \
      https://localhost:8443/api/map-config -o "$rollback/map-config.json"; then
    healthy=true
    break
  fi
  sleep 2
done
test "$healthy" = true
curl --max-time 10 --fail --silent --cacert runtime/tls/verification-ca.crt \
  https://localhost:8443/api/config | python3 -c \
  'import json,sys; r=json.load(sys.stdin); assert r["version"]==sys.argv[1] and r["environment"]=="staging" and r["demo"] is False' "$release"
curl --max-time 10 --fail --silent --cacert runtime/tls/verification-ca.crt \
  https://localhost:8443/realistic3d/status.json | python3 -c \
  'import json,sys; assert json.load(sys.stdin)["enabled"] is True'
./dc exec -T web nginx -t
trap - ERR
printf 'Web/API %s ready. Rollback: /opt/fieldtwin/%s/restore.sh\n' "$release" "$rollback"
