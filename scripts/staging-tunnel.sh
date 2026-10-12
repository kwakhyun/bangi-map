#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
config=.runtime/ncp/ssh_config
socket=.runtime/ncp/tunnel.sock
if [ ! -f "$config" ]; then
  echo 'Private NCP SSH configuration is missing.' >&2
  exit 1
fi
case "${1:-start}" in
  start)
    if ssh -F "$config" -S "$socket" -O check fieldtwin-staging 2>/dev/null; then exit 0; fi
    ssh -F "$config" -M -S "$socket" -fNT -o ExitOnForwardFailure=yes \
      -L 127.0.0.1:8443:127.0.0.1:8443 fieldtwin-staging
    echo 'SSH tunnel ready: https://localhost:8443'
    ;;
  stop) ssh -F "$config" -S "$socket" -O exit fieldtwin-staging ;;
  status) ssh -F "$config" -S "$socket" -O check fieldtwin-staging ;;
  *) echo 'Usage: bash scripts/staging-tunnel.sh [start|stop|status]' >&2; exit 2 ;;
esac
