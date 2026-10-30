#!/usr/bin/env bash
# Runs ON THE BOX after the repo's hermes/profiles were copied to ~/openhq/stage/profiles (see push-sandbox.sh).
# Copies SOUL.md + config.yaml, and writes each profile's .env, into the openhq-agents OpenShell sandbox.
# No model key is written: model.api_key is the sandbox's opaque COMPATIBLE_API_KEY placeholder; OpenShell injects the real key at egress.
set -euo pipefail
REAL=$HOME; . "$REAL/openhq/nemo-env.sh"
set -a; . "$REAL/openhq/hermes.env"; set +a
ST=$REAL/openhq/stage; umask 077
SB="openshell sandbox exec --name openhq-agents --"
# The sandbox only ever holds an opaque placeholder for the model key; the multiplexed gateway resolves ${...} from each profile's own .env.
PH=$($SB printenv COMPATIBLE_API_KEY < /dev/null | tr -d '\r\n')
case "$PH" in openshell:resolve:env:*) ;; *) echo "unexpected COMPATIBLE_API_KEY form in sandbox (not a placeholder)"; exit 1;; esac
for a in cos revenue support ship scout; do
  cat > "$ST/profiles/$a/.env" <<E
COMPATIBLE_API_KEY=$PH
API_SERVER_KEY=$HERMES_KEY
OPENHQ_MCP_TOKEN=${OPENHQ_MCP_TOKEN:-pending}
COMPOSIO_MCP_URL=${COMPOSIO_MCP_URL:-pending}
COMPOSIO_MCP_KEY=${COMPOSIO_MCP_KEY:-pending}
E
  openshell sandbox upload openhq-agents "$ST/profiles/$a" /sandbox/.hermes/profiles --no-git-ignore < /dev/null
  $SB chmod 600 "/sandbox/.hermes/profiles/$a/.env" < /dev/null
done
rm -rf "$ST/profiles"
echo "sandbox profiles provisioned"
