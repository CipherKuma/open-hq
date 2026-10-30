#!/usr/bin/env bash
# Runs ON THE BOX (ssh m2worker bash -s < hermes/box/render-env.sh). Writes each profile's private .env
# inside the openhq-hermes data volume from two files that never leave the box and are never committed:
#   ~/openhq/.env         NEBIUS_API_KEY=...
#   ~/openhq/hermes.env   HERMES_KEY=... HERMES_DEFAULT_KEY=... [OPENHQ_MCP_TOKEN=...] [COMPOSIO_MCP_URL=... COMPOSIO_MCP_KEY=...]
set -euo pipefail
export PATH=/opt/homebrew/bin:$PATH
set -a; . ~/openhq/.env; . ~/openhq/hermes.env; set +a
C=openhq-hermes
put() { docker exec -i -u hermes "$C" sh -c "umask 077; cat > '$1'"; }
# default profile = the host gateway: owns the single API listener (8642) that routes /p/<agent>/ to each profile
put /opt/data/.env <<E
NEBIUS_API_KEY=$NEBIUS_API_KEY
API_SERVER_ENABLED=true
API_SERVER_HOST=0.0.0.0
API_SERVER_PORT=8642
API_SERVER_KEY=$HERMES_DEFAULT_KEY
E
for a in cos revenue support ship scout; do
  put /opt/data/profiles/$a/.env <<E
COMPATIBLE_API_KEY=$NEBIUS_API_KEY
API_SERVER_KEY=$HERMES_KEY
OPENHQ_MCP_TOKEN=${OPENHQ_MCP_TOKEN:-pending}
COMPOSIO_MCP_URL=${COMPOSIO_MCP_URL:-pending}
COMPOSIO_MCP_KEY=${COMPOSIO_MCP_KEY:-pending}
E
done
echo "rendered .env for default + 5 profiles"
