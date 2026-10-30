# apps/web status

All nine screens are built and verified in mock mode at 390 / 768 / 1440 (headless Playwright, no console errors, no horizontal overflow). Production build excludes all fixtures.

## Run
- Mock world (no API needed): `npm run dev:mock -w apps/web` (same as `VITE_API_MODE=mock npm run dev -w apps/web`)
- Against a local Worker: `npm run dev -w apps/web` proxies `/api` (incl. the `/api/live` WebSocket) and `/mcp` to `VITE_API_TARGET` (default `http://127.0.0.1:8787`)
- Build: `npm run build -w apps/web` → `apps/web/dist` (ships `_worker.js` for Pages advanced mode; needs the `API` service binding). Typecheck: `npm run typecheck -w apps/web`

## Screens
| Route | Screen |
|---|---|
| `/` | Tonight: since 09:00, decisions (Approve/Decline sends payloadHash), tonight's list with fill bar against the window, Rewrite handover (`?regenerate=1`), Run a workday now with live per-agent progress |
| `/chat`, `/chat/:channelId` | Chat: rail with DMs (unread, working dot), groups + New group dialog, back room (read-only banner), held-while-at-work divider, inline proposal cards, @mention autocomplete, ref chips, optimistic send + retry, working indicator |
| `/decisions` | Queue filtered by status / agent / product, exact payload + hash, result after execution |
| `/products/:id` | MRR, customers, failed payments, error rate, open tickets, traffic, deploys; sparklines; each metric shows its `source` |
| `/agents/:id` | SOUL, model, runtime badge, tools read/propose, memory, standing orders, schedule (cron in plain English), spend vs budget |
| `/connections` | Catalog by pipeline, status chips, Connect → POST link → opens `redirectUrl` |
| `/schedule` | Week grid (day job, founder hours, handover marker), block editor, interruptions, channel; PUT `/api/schedule` |
| `/activity` | Every model/tool call with model, tokens, cost, runtime, ms; filter by agent; live prepend |
| `/welcome` | Five-step onboarding: products, connect, schedule (PUT), interruptions (PUT), handover preview |

## Data
- `src/api/http.ts`: one typed client, every response parsed with the shared zod schemas; errors surface as `{ error, code }` messages.
- `src/api/live.ts`: WebSocket with jittered backoff (1 s → 30 s); after a reconnect every query refetches.
- `src/api/mock/*`: dev-only fixture world, loaded only when `VITE_API_MODE=mock`.

## Live API notes handled
- GET messages marks a channel read (the UI also zeroes unread locally); back-room posts are never attempted (403 read_only would show inline).
- `/api/demo/workday`: 409 attaches to the run already in flight; 429 shows a calm "3 an hour" notice. Run progress survives a reload for 5 minutes.
- Dev against production: `NODE_OPTIONS="--dns-result-order=ipv4first" VITE_API_TARGET=https://openhq.pages.dev npm run dev -w apps/web` (IPv4 first avoids Node connect timeouts to Cloudflare over IPv6).

## Contract changes the UI would use (tolerated today)
- Persist to-do completion (e.g. `PATCH /api/handover/todo/:id { done }`). The UI stores ticks in localStorage per date.
- Add a product (`POST /api/products`). Onboarding step 1 only lists `workspace.products`.
