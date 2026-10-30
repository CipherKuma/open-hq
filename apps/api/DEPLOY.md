# Deploying `openhq-api` (coordinator runs these; nothing here has been run against Cloudflare)

All commands from `apps/api`. Worker `openhq-api`, `workers_dev = false`, so it is reachable only through the Pages service binding.

## 1. D1
```bash
npx wrangler d1 create openhq                     # prints database_id
# put the id into wrangler.toml:
sed -i '' 's/REPLACE_WITH_ID_FROM_wrangler_d1_create/<database_id>/' wrangler.toml
npx wrangler d1 migrations apply openhq --remote  # 0001_init.sql (schema) + 0002_seed.sql (demo world)
```

## 2. R2
```bash
npx wrangler r2 bucket create openhq-runs
```

## 3. Secrets (never print them)
`NEBIUS_API_KEY` and `COMPOSIO_API_KEY` come from the vault; the other three are generated.
```bash
T=$(mktemp -d)
~/.claude/vault/inject.sh get NEBIUS_API_KEY --dir "$T" >/dev/null
~/.claude/vault/inject.sh get COMPOSIO_API_KEY --dir "$T" >/dev/null
grep '^NEBIUS_API_KEY=' "$T/.env.local"   | cut -d= -f2- | npx wrangler secret put NEBIUS_API_KEY
grep '^COMPOSIO_API_KEY=' "$T/.env.local" | cut -d= -f2- | npx wrangler secret put COMPOSIO_API_KEY
# MCP_TOKEN: the bearer Hermes sends to POST /mcp. INGEST_SECRET: the bearer Nebius Jobs send to /api/ingest.
# Keep copies in files (mode 600) so Hermes config and the jobs can be given the same values:
openssl rand -hex 24 | tee "$T/mcp_token"      | npx wrangler secret put MCP_TOKEN
openssl rand -hex 24 | tee "$T/ingest_secret"  | npx wrangler secret put INGEST_SECRET
# Hermes gateway (skip while AGENT_RUNTIME = "loop"):
printf '%s' "https://<hermes-gateway-host>" | npx wrangler secret put HERMES_URL
<read HERMES_KEY from wherever the hermes agent stored it> | npx wrangler secret put HERMES_KEY
rm -rf "$T"   # after the Hermes config and the jobs have the token files
```
Switch runtimes by editing `AGENT_RUNTIME` in `wrangler.toml` `[vars]` (`"loop"` default, `"hermes"` uses Hermes with a 25 s timeout and falls back to the loop).

## 4. Worker
```bash
npx wrangler deploy        # also registers the cron */10 * * * *, the LiveHub Durable Object and both Workflows
curl -s https://<route>/api/health   # only through Pages, see below
```

## 5. Pages project `openhq` with a service binding `API` -> `openhq-api`
```bash
cd ../web && npm run build
npx wrangler pages project create openhq --production-branch main
npx wrangler pages deploy dist --project-name openhq
```
Bind the Worker: Pages dashboard > openhq > Settings > Functions > Service bindings > add `API` = `openhq-api` (production). Or commit it in `apps/web/wrangler.toml`:
```toml
name = "openhq"
pages_build_output_dir = "dist"
[[services]]
binding = "API"
service = "openhq-api"
```
`apps/web/public/_worker.js` must forward the request unchanged (`env.API.fetch(request)`) so the Worker sees `cf-connecting-ip` (per-IP rate limit) and the WebSocket upgrade for `/api/live`.

## 6. Smoke test (through https://openhq.pages.dev)
```bash
curl -s https://openhq.pages.dev/api/workspace | head -c 200
curl -s -X POST https://openhq.pages.dev/api/channels/dm:revenue/messages -H 'content-type: application/json' -d '{"text":"Where do we stand on MRR?"}'
curl -s -X POST https://openhq.pages.dev/api/demo/workday     # {"runId": ...}; handover appears at GET /api/handover in ~1 min
```

## Local development
```bash
cp .dev.vars.example .dev.vars        # fill NEBIUS_API_KEY via ~/.claude/vault/inject.sh get NEBIUS_API_KEY --dir . then rename .env.local -> .dev.vars
npm run migrate:local && npm run dev  # http://localhost:8787 (add --port to change)
npm test && npm run typecheck
curl "http://localhost:8787/cdn-cgi/handler/scheduled?cron=*/10+*+*+*+*"   # fire the cron dispatcher
```
