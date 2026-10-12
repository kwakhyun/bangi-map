#!/usr/bin/env bash
# Run only after reviewing the server-side contract. No SSH key is sent to GitHub.
set -euo pipefail
cd "$(dirname "$0")/../.."
test -s infra/cicd/ncp-callback-public.pem
mkdir -p .runtime/cicd-install
python3 scripts/cicd/release.py baseline > .runtime/cicd-install/baseline.json
ssh_args=(-F .runtime/ncp/ssh_config)
ssh "${ssh_args[@]}" fieldtwin-staging 'install -d -m 700 /opt/fieldtwin/ci-incoming'
scp "${ssh_args[@]}" scripts/cicd/{agent,deploy,release}.py \
  infra/cicd/bangi-deploy.{service,timer} .runtime/cicd-install/baseline.json \
  fieldtwin-staging:/opt/fieldtwin/ci-incoming/
ssh "${ssh_args[@]}" fieldtwin-staging 'bash -s' <<'SH'
set -euo pipefail
cd /opt/fieldtwin
test -s runtime/cicd/callback.key
python3 - <<'PY'
from pathlib import Path
import json
previous=Path('runtime/cicd/baseline.json')
if previous.exists():
    assert json.loads(previous.read_text())['migrations']==json.loads(Path('ci-incoming/baseline.json').read_text())['migrations'], 'Review and apply DB changes before installing a different migration baseline'
PY
systemctl stop bangi-deploy.timer 2>/dev/null || true
if systemctl cat bangi-deploy.service >/dev/null 2>&1; then systemctl stop bangi-deploy.service; fi
if [ -d ci ]; then mv ci "ci-backup-$(date +%Y%m%d-%H%M%S)"; fi
install -d -m 700 ci runtime/cicd
install -m 600 ci-incoming/{agent,deploy,release}.py ci/
install -m 600 ci-incoming/baseline.json runtime/cicd/baseline.json
install -m 644 ci-incoming/bangi-deploy.{service,timer} /etc/systemd/system/
python3 -m py_compile ci/*.py
systemd-analyze verify /etc/systemd/system/bangi-deploy.service /etc/systemd/system/bangi-deploy.timer
systemctl daemon-reload
systemctl enable --now bangi-deploy.timer
systemctl start bangi-deploy.service
systemctl is-active bangi-deploy.timer
SH
