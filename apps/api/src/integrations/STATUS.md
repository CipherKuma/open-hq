# Integrations status

Updated 2026-10-30 13:05 MYT (milestone 1, before live OAuth).

## Verified
- Typecheck clean; vitest 17 tests pass (allowlist enforcement, live-mode refusal, webhook signatures, revert logic, web-fetch safety).
- Runs under workerd (`wrangler dev`): Composio REST over fetch, no SDK needed. `readToolsFor` lists the right tools per agent; `callReadTool` rejects off-list tools; web fetch works on public pages and blocks private hosts.
- Composio enforces the per-session tool list server-side (`STRIPE_CREATE_REFUND` on a read session returns "not enabled for this session").
- Finding: `tags.disable ["destructiveHint"]` does NOT remove a destructive slug that is explicitly enabled. The allowlist is the real control; `readToolsFor` also drops any tool tagged destructive/create/update.

## Webhooks and triggers: needs its own Composio project
A Composio project has one webhook subscription and this one belongs to Probity, so Open HQ does not take it over (coordinator decision). Agents rely on polling in their cron shifts.
`verifyComposioWebhook` is implemented and unit-tested but unused. `demo/setup-triggers.mjs` refuses to run against this project (exit 2) unless `--takeover` is passed; use it only with a separate Composio project/API key.
Sentry has no Composio triggers at all, so it is poll-only regardless.

## Live evidence (13:30 MYT)
- Gmail (jedionchain@gmail.com, ACTIVE): support reads via Composio on workerd return compacted messages; `email_reply` sent a real reply (to self) through GMAIL_REPLY_TO_THREAD.
- GitHub (CipherKuma, ACTIVE via bearer-token import, `demo/connect-github-pat.mjs`; Composio GitHub has no PAT/API-key scheme, but "import existing connections" accepts a bearer token under a BEARER_TOKEN auth config): ship and scout reads work; `github_issue` opened and closed issue #1; `github_revert` opened PR #2 (removed the file the commit added, authored by Cipher Kuma), then closed. `github_traffic_referrers` works through the session proxy.
- Sessions must pin the connected account (`connected_accounts`); done automatically in `createSession`.
- Dashboard: openTickets (Gmail), deploys (GitHub commits fallback), traffic labelled "sample" (repo has 0 views), Stripe/Sentry pending.

## Privacy scoping and Tidyform (13:40 MYT)
- Gmail is scoped everywhere: `SUPPORT_QUERY` (`subject:"[Tidyform support]" OR label:tidyform-support`, in allowlists.ts) is AND-ed onto every agent Gmail query by callReadTool (grouping characters stripped so it cannot be widened), mailbox pinned to `me`, and by-id reads are rejected unless the id appears in the scoped search. `GMAIL_LIST_LABELS` was removed from the support allowlist. The dashboard counts only scoped inbox threads (no whole-inbox fallback).
- Hermes: Composio's MCP cannot force the Gmail scope, so `hermesMcpConfig("support")` returns an MCP with no tools. Hermes must read support mail through an Open HQ read tool that calls `callReadTool`.
- Tidyform is now a Cloudflare Pages project `tidyform` (tidyform.pages.dev), deployed with `demo/tidyform/deploy.mjs [--break] [--secrets]`. `/api/submit` sends the message to jedionchain@gmail.com via Composio's Gmail connection (Gmail API through the session proxy, so Reply-To is the customer) with subject `[Tidyform support] ...`. It needs the Pages secret COMPOSIO_API_KEY. Verified under `wrangler pages dev`; four realistic submissions (including a polite prompt-injection attempt from Dmitri Volkov) are in the inbox and visible to Support through the scoped read.
- deploy_rollback now uses the Cloudflare Pages API (list production deployments, roll back to the last good one before the live one). Needs CLOUDFLARE_API_TOKEN (Pages edit) and CLOUDFLARE_ACCOUNT_ID as Worker secrets. Unit-tested against a mocked API only.

## Waiting on
Stripe (OAuth link or `demo/connect-stripe-key.mjs`, then `demo/stripe-seed.mjs`, which now runs through Composio and refuses unless livemode=false) and Sentry (org jedi-40, project tidyform). Cloudflare credentials for deploy_rollback are untested.

## Env (Worker secrets / vars)
COMPOSIO_API_KEY (required). Optional: COMPOSIO_WEBHOOK_SECRET, COMPOSIO_USER_ID, PUBLIC_URL, DEMO_GITHUB_OWNER/REPO, DEMO_SENTRY_ORG, CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID (deploy_rollback, deploy history), TIDYFORM_PAGES_PROJECT.

## Payloads execute() expects (zod in payloads.ts)
- stripe_refund: `{ charge | paymentIntent, amount?, reason? }`
- email_reply: `{ threadId, to, body, cc? }`
- github_issue: `{ owner?, repo?, title, body?, labels? }` (defaults CipherKuma/tidyform)
- github_revert: `{ owner?, repo?, sha, baseBranch?, reason? }`
- deploy_rollback: `{ project?, deploymentId? }` (Cloudflare Pages)
- social_post: always `{ ok:false, detail:"not connected" }`; standing_order and memory are not handled here.

verifyComposioWebhook throws WebhookAuthError on a bad signature (respond 401) and returns null for ignored events.
