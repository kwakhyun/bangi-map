#!/usr/bin/env bash
# Run on the existing NCP VM. Only recreates web; API, DB and TLS stay running.
set -euo pipefail
cd /opt/fieldtwin
release="${1:?Usage: upgrade-vworld.sh RELEASE_TAG}"
[[ "$release" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || exit 2
docker image inspect "fieldtwin-web:$release" >/dev/null
test -f runtime/vworld-next/sdk-loader.js
test -f infra/single-vm/compose.vworld.yaml
test -f runtime/tls/verification-ca.crt
umask 077
rollback="rollback-vworld-$(date +%Y%m%d-%H%M%S)"
mkdir "$rollback"
cp -p runtime/compose.env "$rollback/compose.env"
cp -p dc "$rollback/dc"
if [ -d runtime/vworld ]; then cp -a runtime/vworld "$rollback/vworld"; fi
restore() {
  cp -p "$rollback/compose.env" runtime/compose.env
  cp -p "$rollback/dc" dc
  if [ -d "$rollback/vworld" ]; then
    mv runtime/vworld "runtime/vworld-failed-$(date +%s)"
    cp -a "$rollback/vworld" runtime/vworld
  fi
  ./dc up -d --no-deps web
}
trap restore ERR
if [ -d runtime/vworld ]; then mv runtime/vworld "$rollback/previous-active"; fi
mv runtime/vworld-next runtime/vworld
chown -R 101:101 runtime/vworld
chmod 700 runtime/vworld
find runtime/vworld -type f -exec chmod 600 {} \;
python3 - "$release" <<'PY'
from pathlib import Path
import sys
p=Path('runtime/compose.env')
lines=[s for s in p.read_text().splitlines() if not s.startswith('WEB_IMAGE=')]
p.write_text('\n'.join(lines)+f'\nWEB_IMAGE=fieldtwin-web:{sys.argv[1]}\n')
p=Path('dc')
s=p.read_text()
if 'compose.vworld.yaml' not in s:
    s=s.replace('"$@"','-f infra/single-vm/compose.vworld.yaml "$@"')
p.write_text(s)
PY
./dc config --quiet
./dc run --rm --no-deps -T web nginx -t </dev/null
./dc up -d --no-deps web
healthy=false
for i in $(seq 1 30); do
  if curl --max-time 5 --fail --silent --cacert runtime/tls/verification-ca.crt https://localhost:8443/health >/dev/null; then healthy=true; break; fi
  sleep 2
done
test "$healthy" = true
curl --max-time 10 --fail --silent --cacert runtime/tls/verification-ca.crt https://localhost:8443/realistic3d/status.json | python3 -c 'import sys,json; assert json.load(sys.stdin)["enabled"] is True'
trap - ERR
printf 'Web release %s is healthy. Rollback files: %s\n' "$release" "$rollback"
