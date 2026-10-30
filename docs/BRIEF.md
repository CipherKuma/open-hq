# Open HQ: build brief (agent-to-agent, terse)

Deadline: submit by 00:15 MYT Sat 31 Oct (hard close 01:00). Now: Fri 30 Oct ~13:00 MYT.
Product: five AI agents run a solo founder's products while the founder works a day job; evening handover sized to founder hours; chat with agents, groups, back room; approval then the app executes.
Design reference (read, don't copy markup): workplace page source at
`/Users/gabrielantonyxaviour/Documents/hackathons/nebius-nvidia-2026/openhq/plan/workplace.html`
and plan v10 `/Users/gabrielantonyxaviour/Documents/hackathons/nebius-nvidia-2026/openhq/plan/index.html`.

## Hard rules (all agents)
- Repo: `/Users/gabrielantonyxaviour/Documents/cipherkuma/open-hq`. Stay inside your owned paths. Do NOT commit or push; the coordinator commits.
- Secrets: only via `~/.claude/vault/inject.sh get NAME --dir <dir>` (writes .env.local / use .dev.vars). Never open ~/.claude/vault/.env.master or ~/.env.secrets, never print a secret, never write one into a tracked file. Worker secrets via `wrangler secret put NAME < file` (coordinator deploys; you may prepare the commands).
- Never put "gabrielaxy" in any URL, file, README or UI. Public identity is Cipher Kuma.
- Product inference: NVIDIA open models on Nebius Token Factory only (`https://api.tokenfactory.nebius.com/v1`, key NEBIUS_API_KEY). No closed models. Call `GET /v1/models` first and use exact IDs. Targets: Chief of Staff = Nemotron 3 Ultra (550b); Revenue/Support/Ship/Scout = Nemotron 3.5 Super VL; triage + injection screen = Nemotron 3.5 Lightning (thinking off); memory embeddings = Qwen3-Embedding-8B. Super 120b and Nano 30B retire 9 Nov: don't use them.
- No Worker, cron or Workflow may call the Nebius AI Cloud control plane (`/ai/v1/jobs`, IAM). Token Factory from Workers is fine.
- Files < 300 lines. No console.log in production code. zod on every API input. Errors return `{ error, code? }` only. Realistic data, never lorem ipsum or "John Doe".
- Shared contract: `packages/shared/src/contract.ts` (coordinator owns; ask before changing; additive changes OK if you tell the coordinator in your handback).

## Architecture
- `apps/web`: Vite + React + TS SPA. Build output served by Cloudflare Pages project `openhq` (openhq.pages.dev). `apps/web/public/_worker.js` (advanced mode) forwards `/api/*` (incl. WebSocket `/api/live`) and `/mcp` to service binding `API`, everything else to `env.ASSETS`.
- `apps/api`: Cloudflare Worker `openhq-api` (`workers_dev = false`), Hono + zod. D1 `openhq` (schema in `apps/api/migrations`), R2 `openhq-runs` (run logs), Durable Object `LiveHub` (WebSocket hibernation fan-out of LiveEvent), Workflow `WorkdayWorkflow` (runs all shifts, then the Chief of Staff handover), cron `*/10 * * * *` dispatcher (decides which agent shifts are due from the schedule + founder timezone; holds non-urgent posts during day-job hours: `heldDuringWork=true`).
- Agent runtime interface `apps/api/src/runtime/types.ts` (api agent owns):
  `run({ agent, trigger: "chat"|"shift"|"backroom"|"handover", channelId, prompt, history }) -> { text, model, tokensIn, tokensOut, runtime: "hermes"|"loop" }`.
  Side effects (post message, message another agent, propose action, remember) happen ONLY through internal tools in `apps/api/src/tools/internal.ts`, exposed two ways: called directly by the loop runtime, and as an MCP server at `POST /mcp` (Streamable HTTP, bearer `MCP_TOKEN`, header `x-openhq-agent: <agentId>` selects the caller) so Hermes agents can call them.
  - `loop` runtime (`runtime/loop.ts`, api agent): OpenAI-style tool-calling loop against Token Factory, max 8 steps, tools = internal tools + the agent's Composio read tools.
  - `hermes` runtime (`runtime/hermes.ts`, hermes agent): POSTs to the Hermes gateway for that agent's profile (`HERMES_URL` + per-profile route, bearer `HERMES_KEY`); Hermes holds Composio MCP (read-only for that agent) + Open HQ MCP. Selection: env `AGENT_RUNTIME=hermes|loop`; on Hermes error/timeout (25 s) fall back to loop and log `runtime: "loop"`.
- Back room: an agent calls `message_agent({ to, text })` → message in a `backroom:<threadId>` channel → recipient agent runs with trigger `backroom`. Thread stops after 6 messages or budget hit → escalates to `cos`. Agents cannot approve proposals.
- Approval: `propose_action` stores Proposal with `payloadHash = sha256(canonical JSON of payload)`. `POST /api/proposals/:id/decision` requires the same hash, then the runner calls `integrations.execute(proposal)`. Agents only ever get READ tools.
- Integrations module `apps/api/src/integrations/` (integrations agent owns), exports from `index.ts`:
  `readToolsFor(agent, env): Promise<OpenAITool[]>`, `callReadTool(agent, name, args, env): Promise<unknown>` (enforces per-agent allowlist), `execute(proposal, env): Promise<{ ok, detail, url }>`, `listConnections(env): Promise<Connection[]>`, `linkConnection(toolkit, env): Promise<{ redirectUrl }>`, `verifyComposioWebhook(req, env): Promise<NormalizedEvent | null>`, `dashboardData(productId, env): Promise<Dashboard>`, `hermesMcpConfig(agent, env): Promise<{ url, headers }>` (per-agent read-only Composio MCP for Hermes).
  Composio: Gabriel's account, key COMPOSIO_API_KEY, user_id `openhq-demo`. Read-only enforcement via session tool allowlists + `tags.disable: ["destructiveHint"]`. If `@composio/core` doesn't run on Workers, call Composio's REST API with fetch.
- Per-agent Composio toolkits: revenue=stripe; support=gmail; ship=github,sentry; scout=github (stars/traffic), plus web fetch of competitor pages; cos=none (reads other agents' output).
- Nebius Serverless Jobs (`jobs/`, later): Hermes weekly deep review, NeMo Guardrails pass, GPU Content Safety audit; started from the CLI only (`nebius --profile hackathon-jobs-sa`), POST results to `/api/ingest` with bearer INGEST_SECRET.
- Self-host box: M2 Mac `ssh m2worker` (always on, macOS arm64, 8 GB RAM, colima 6 GiB running, openshell 0.0.116, nemoclaw v0.0.137, cloudflared). OTHER PRODUCTS' sandboxes live there (settla-pool-*, companion-arjun) and tunnel `ledger-axl`: never stop, modify or delete them. Name everything you create `openhq-*`.

## Demo world (realistic, labelled sample where seeded)
Founder: Cipher Kuma, Asia/Kuala_Lumpur. Day job Mon–Sat 09:00–18:00. Founder hours Mon–Sat 19:00–23:00, Sun 10:00–16:00. Handover lead 15 min. Urgent rules: site_down, checkout_failing, security.
Products: **Tidyform** (form backend for indie sites, $12/mo, tidyform.pages.dev style; real GitHub repo CipherKuma/tidyform, Stripe sandbox, Sentry, support inbox jedionchain@gmail.com) and **Quillbill** (invoicing for freelance translators, $29/mo; Stripe sandbox data only).
