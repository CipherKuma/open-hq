#!/usr/bin/env node
// Repairs existing Composio sessions (e.g. MCP URLs already configured in Hermes) that fail with
// "No active connection found for toolkit(s) ...": pins each session to the demo user's ACTIVE connected accounts.
// Usage: node repin-sessions.mjs <session id or MCP url> [...]
import { loadEnv, composio, USER_ID } from "./lib.mjs";

loadEnv();
const refs = process.argv.slice(2);
if (!refs.length) { process.stderr.write("Pass session ids (trs_...) or MCP URLs.\n"); process.exit(1); }
const accounts = (await composio(`/api/v3/connected_accounts?user_ids=${USER_ID}&statuses=ACTIVE&limit=100`)).items ?? [];
const newest = new Map();
for (const a of accounts.sort((x, y) => String(y.created_at).localeCompare(String(x.created_at)))) {
  const tk = a.toolkit?.slug;
  if (!newest.has(tk)) newest.set(tk, a.id);
}
for (const ref of refs) {
  const id = ref.match(/trs_[A-Za-z0-9_-]+/)?.[0];
  if (!id) { process.stdout.write(`skip ${ref}: no session id\n`); continue; }
  const cfg = await composio(`/api/v3.1/tool_router/session/${id}`);
  const toolkits = cfg.config?.toolkits?.enabled ?? [];
  const pins = Object.fromEntries(toolkits.filter((t) => newest.has(t)).map((t) => [t, newest.get(t)]));
  if (!Object.keys(pins).length) { process.stdout.write(`${id}: nothing to pin (no ACTIVE connection for ${toolkits.join(", ")})\n`); continue; }
  await composio(`/api/v3.1/tool_router/session/${id}`, { method: "PATCH", body: JSON.stringify({ connected_accounts: pins }) });
  process.stdout.write(`${id}: pinned ${Object.keys(pins).join(", ") || "nothing"}\n`);
}
