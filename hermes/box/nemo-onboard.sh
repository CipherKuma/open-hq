#!/usr/bin/env bash
# Runs ON THE BOX. NemoClaw onboarding for the openhq-agents sandbox, fully isolated from other products:
#  - its own HOME/XDG dirs, so ~/.nemoclaw registry and OpenShell's active_gateway file are NOT shared;
#  - its own OpenShell gateway on port 19270 (the box's existing gateway, 19260, is never selected or touched).
set -euo pipefail
REAL=$HOME
export PATH="$(ls -d $REAL/.local/state/fnm_multishells/*/bin 2>/dev/null | tail -1):/opt/homebrew/bin:$PATH"
set -a; . "$REAL/openhq/.env"; set +a
export NEMO_HOME=$REAL/openhq/nemo-home
mkdir -p "$NEMO_HOME/.nemoclaw"; [ -e "$NEMO_HOME/.nemoclaw/source" ] || ln -s "$REAL/.nemoclaw/source" "$NEMO_HOME/.nemoclaw/source"
export HOME=$NEMO_HOME XDG_CONFIG_HOME=$NEMO_HOME/.config XDG_STATE_HOME=$NEMO_HOME/.local/state XDG_DATA_HOME=$NEMO_HOME/.local/share
export DOCKER_HOST=unix://$REAL/.colima/default/docker.sock
export NEMOCLAW_GATEWAY_PORT=19270
export NEMOCLAW_DISABLE_TELEMETRY=1 NEMOCLAW_NON_INTERACTIVE=1 NEMOCLAW_ACCEPT_THIRD_PARTY_SOFTWARE=1 NEMOCLAW_YES=1
export NEMOCLAW_AGENT=hermes NEMOCLAW_SANDBOX_NAME=openhq-agents NEMOCLAW_POLICY_TIER=restricted
export NEMOCLAW_PROVIDER=custom NEMOCLAW_ENDPOINT_URL=https://api.tokenfactory.nebius.com/v1
export NEMOCLAW_MODEL=nvidia/Nemotron-3.5-Super-VL
export COMPATIBLE_API_KEY=$NEBIUS_API_KEY
export NEMOCLAW_IGNORE_RUNTIME_RESOURCES=1   # colima has 6 GiB, NemoClaw wants 8; headroom checked by hand (see README)
unset NEBIUS_API_KEY
exec nemohermes onboard --non-interactive --yes-i-accept-third-party-software "$@"
