#!/usr/bin/env node
// Prints Composio connect links (redirect URLs) for Open HQ's demo user. Links expire after ~10 minutes,
// so run this right before completing each OAuth. Usage: node connect-links.mjs [toolkit ...] [--write] [--wait]
// --wait keeps polling until every requested toolkit shows an ACTIVE connection for the demo user.
import { writeFileSync } from "node:fs";
import { loadEnv, composio, session, USER_ID } from "./lib.mjs";

loadEnv();
const args = process.argv.slice(2);
const write = args.includes("--write");
const wait = args.includes("--wait");
const toolkits = args.filter((a) => !a.startsWith("--"));
const targets = toolkits.length ? toolkits : ["github", "stripe", "gmail", "sentry"];

const s = await session(targets);
const lines = [];
for (const toolkit of targets) {
  try {
    const link = await composio(`/api/v3.1/tool_router/session/${s.session_id}/link`, {
      method: "POST",
      body: JSON.stringify({ toolkit }),
    });
    lines.push(`- ${toolkit}: ${link.redirect_url}`);
  } catch (e) {
    lines.push(`- ${toolkit}: ERROR ${e.message}`);
  }
}
const out = [
  "# Open HQ connect links",
  "",
  `Composio user_id: \`${USER_ID}\`. Generated ${new Date().toISOString()}. Each link expires about 10 minutes after generation; to get fresh ones run \`~/.claude/vault/inject.sh get COMPOSIO_API_KEY --dir /tmp/ohq-env && ENV_FILE=/tmp/ohq-env/.env.local node demo/connect-links.mjs --write --wait\` (add toolkit names to limit it; --wait polls until each is connected).`,
  "",
  ...lines,
  "",
  "Notes",
  "- GitHub: sign in as Cipher Kuma (the account that owns CipherKuma/tidyform). Grant the repo scopes.",
  "- Stripe: connect the Stripe SANDBOX (test mode) account only. The app refuses to run writes against a live-mode account.",
  "- Gmail: sign in as the support inbox (jedionchain@gmail.com).",
  "- Sentry: sign in to the org that holds the Tidyform project.",
  "- Check status any time: `node demo/connect-status.mjs`.",
  "",
].join("\n");
process.stdout.write(out);
if (write) writeFileSync(new URL("./CONNECT.md", import.meta.url), out);

if (wait) {
  const pending = new Set(targets);
  const deadline = Date.now() + 9 * 60_000;
  while (pending.size && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 5000));
    const res = await composio(`/api/v3/connected_accounts?user_ids=${USER_ID}&statuses=ACTIVE&limit=100`);
    for (const a of res.items ?? []) if (pending.delete(a.toolkit?.slug)) process.stdout.write(`connected: ${a.toolkit.slug}\n`);
  }
  if (pending.size) process.stdout.write(`still waiting: ${[...pending].join(", ")}\n`);
}
