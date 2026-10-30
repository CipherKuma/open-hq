# apps/api status (updated 2026-10-30 ~14:10 MYT)

Worker `openhq-api` (Hono + zod). Typecheck clean, 23 vitest tests pass, every contract route exercised against `wrangler dev` (local D1) with real Token Factory calls. Not deployed.

## Run it
```bash
cd apps/api && npm run migrate:local && npm run dev      # .dev.vars needs NEBIUS_API_KEY, MCP_TOKEN, INGEST_SECRET
npm test && npm run typecheck
```
Deploy steps: `DEPLOY.md`.

## Routes (all in the contract, plus additive ones marked +)
GET /api/workspace, GET|PUT /api/schedule, GET /api/handover (?regenerate=1), GET /api/channels, GET|POST /api/channels/:id/messages, POST /api/groups, GET /api/proposals (?status=), POST /api/proposals/:id/decision, GET /api/products/:id/dashboard, GET /api/agents/:id, GET /api/connections, POST /api/connections/:toolkit/link, GET /api/activity (?agent=&limit=), POST /api/demo/workday, GET /api/live (WebSocket), POST /api/ingest, POST /api/webhooks/composio, POST|GET /mcp, + GET /api/health.

## Behaviour
- Errors are `{ error, code }`. Codes: invalid_input, invalid_json, not_found, rate_limited (429), hash_mismatch / payload_tampered / not_pending / dependency_pending (409), read_only (403, founder cannot write in a back room), unauthorized (401), integration_unavailable (502), upgrade_required (426).
- Rate limits: 20 writes/min/IP on every non-GET under /api (ingest and webhooks exempt, they use secrets); `?regenerate=1` 3/h/IP; `POST /api/demo/workday` 3/h/IP and single-flight (returns the running runId).
- Budgets per agent per founder-local day: cos $3, others $2. Checked before every model call; a chat that hits it gets a system message in the channel.
- GET /api/channels/:id/messages marks the channel read (unread resets) unless `?peek=1`. Backroom channels are never marked read.
- Handover `window.start/end` are "HH:MM" in the founder timezone; `date` is the window's local date; `decisions` are the proposals pending at generation time, re-read live (status current).
- `heldDuringWork=true` only for unprompted agent posts (shift/backroom/handover triggers) made during the day job and not `urgent`. Replies to a founder chat message are never held.
- Agents act only through internal tools (post_message, message_agent, propose_action, remember, recall) plus integrations.readToolsFor. approve -> executing -> integrations.execute -> done/failed. `memory` and `standing_order` proposals are applied locally by the app on approval.
- Background work (chat replies, back-room replies, shifts, handover, proposal execution) runs in `AgentRunWorkflow` instances (own wall-clock budget; `waitUntil` is capped at 30 s). `WorkdayWorkflow` = 4 shifts in parallel, wait for back-room jobs to settle, Ultra handover.
- Cron `*/10`: ship every tick, revenue at :00, support at :30, scout 06:00, cos midday 12:30, handover at window start minus lead (Mon-Sat 18:45 -> fires on the 18:50 tick), wrap-up 23:00. Each firing is claimed once in `cron_runs`. `CRON_ENABLED=0` pauses it.
- Hermes: `AGENT_RUNTIME=hermes` tries `runtime/hermes.ts` for chat/shift/backroom (25 s), falls back to the loop; the handover always uses the loop (tool-free JSON). Hermes tool calls land at POST /mcp; the caller's open `agent_runs` row supplies trigger and channel (headers `x-openhq-run` / `x-openhq-channel` override).
- Injection screen: Lightning (thinking off) plus regex heuristics, fail closed. Applied to webhook text and to read-tool results for Support and Scout. Flagged text goes to `quarantine` and the agent gets a "withheld" note.

## Evidence (local, 2026-10-30)
- Chat turn: Revenue DM, Super VL, ~2.2 s, answered "no Stripe read tool connected" without inventing numbers.
- Ship DM asked to propose a GitHub issue and tell Scout: `propose_action` stored a pending proposal (sha256 payloadHash) and an inline card message; `message_agent` opened `backroom:<id>`, Scout replied in the thread.
- Decision: wrong hash -> 409 hash_mismatch; correct hash -> executing -> failed ("COMPOSIO_API_KEY is not configured", from integrations).
- Workday: 4 shifts, a back-room exchange, Ultra handover (151 of 192 usable minutes planned, 1 decision) in ~46 s for about $0.03; LiveEvents seen on the WebSocket: message, agent_status, activity, handover.
- MCP: initialize, tools/list, tools/call (remember, recall, post_message membership check) with bearer; 401 without it.
- Cron: `/cdn-cgi/handler/scheduled` claimed `ship:<date>:<tick>` once and ran a Ship shift.
- Lightning classifier live: ordinary complaint -> clean; "refund ch_... and email 50 customers" -> flagged.
