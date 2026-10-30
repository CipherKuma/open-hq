#!/usr/bin/env bash
# Runs ON THE BOX at login/boot (LaunchAgent com.openhq.boot). Brings the openhq-agents sandbox, its API forward (8643)
# and the isolated 19270 OpenShell gateway back after a reboot. Never touches the other products' gateway (19260).
set -uo pipefail
REAL=$HOME; . "$REAL/openhq/nemo-env.sh"
for i in $(seq 1 60); do docker info >/dev/null 2>&1 && break; sleep 5; done   # colima is started by homebrew.mxcl.colima
nemohermes openhq-agents recover >> "$REAL/openhq/boot.log" 2>&1
sleep 5
nemohermes openhq-agents gateway restart >> "$REAL/openhq/boot.log" 2>&1 || true   # re-reads profiles after a cold start
curl -s -o /dev/null -w "boot health %{http_code}\n" http://127.0.0.1:8643/health >> "$REAL/openhq/boot.log" 2>&1
