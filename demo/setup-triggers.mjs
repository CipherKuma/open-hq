#!/usr/bin/env node
// Creates Composio triggers for the demo user and points the project's webhook at Open HQ.
//
// WARNING: a Composio project has ONE webhook subscription. If it already points somewhere else (another
// product on the same Composio account), this script refuses to touch it or create triggers, because the
// events would be delivered to that other product. Pass --takeover to repoint it deliberately.
//
// Usage: node setup-triggers.mjs [--dry-run] [--takeover] [--secret-out <file>]
//   --secret-out writes COMPOSIO_WEBHOOK_SECRET=<signing secret> to a file (mode 600); the secret is never printed.
import { writeFileSync } from "node:fs";
import { loadEnv, composio, USER_ID } from "./lib.mjs";

loadEnv();
const args = process.argv.slice(2);
const dry = args.includes("--dry-run");
const takeover = args.includes("--takeover");
const secretOut = args.includes("--secret-out") ? args[args.indexOf("--secret-out") + 1] : null;
const WEBHOOK_URL = "https://openhq.pages.dev/api/webhooks/composio";
const repo = { owner: "CipherKuma", repo: "tidyform" };

const TRIGGERS = [
  ["GITHUB_COMMIT_EVENT", repo],
  ["GITHUB_PULL_REQUEST_EVENT", repo],
  ["GITHUB_ISSUE_ADDED_EVENT", repo],
  ["GITHUB_STAR_ADDED_EVENT", repo],
  ["GMAIL_NEW_GMAIL_MESSAGE", { labelIds: "INBOX", interval: 2 }],
  ["STRIPE_CHARGE_FAILED", {}],
  ["STRIPE_CUSTOMER_SUBSCRIPTION_DELETED", {}],
];

const subs = (await composio("/api/v3.1/webhook_subscriptions")).items ?? [];
const existing = subs[0];
if (existing && existing.webhook_url !== WEBHOOK_URL) {
  if (!takeover) {
    process.stdout.write(
      `The Composio project already delivers webhooks to ${existing.webhook_url}.\n` +
        `Repointing it would cut that product off, so nothing was changed and no triggers were created.\n` +
        `Options: (1) use a separate Composio project/API key for Open HQ, (2) re-run with --takeover,\n` +
        `(3) skip webhooks and let the cron shifts poll (the app works without them).\n`,
    );
    process.exit(2);
  }
}

let secret = existing?.secret;
if (!dry) {
  const body = JSON.stringify({ webhook_url: WEBHOOK_URL, enabled_events: ["composio.trigger.message", "composio.connected_account.expired"], version: "V3" });
  if (!existing) {
    secret = (await composio("/api/v3.1/webhook_subscriptions", { method: "POST", body })).secret;
    process.stdout.write(`webhook subscription created -> ${WEBHOOK_URL}\n`);
  } else if (existing.webhook_url !== WEBHOOK_URL) {
    const r = await composio(`/api/v3.1/webhook_subscriptions/${existing.id}`, { method: "PATCH", body });
    secret = r.secret ?? secret;
    process.stdout.write(`webhook subscription repointed -> ${WEBHOOK_URL}\n`);
  } else process.stdout.write("webhook subscription already points at Open HQ\n");
  if (secretOut && secret) {
    writeFileSync(secretOut, `COMPOSIO_WEBHOOK_SECRET=${secret}\n`, { mode: 0o600 });
    process.stdout.write(`signing secret written to ${secretOut} (not printed)\n`);
  }
}

for (const [slug, config] of TRIGGERS) {
  if (dry) { process.stdout.write(`[dry-run] would create ${slug}\n`); continue; }
  try {
    const r = await composio(`/api/v3.1/trigger_instances/${slug}/upsert`, { method: "POST", body: JSON.stringify({ user_id: USER_ID, trigger_config: config }) });
    process.stdout.write(`ok   ${slug} ${r.trigger_id ?? r.id ?? ""}\n`);
  } catch (e) {
    process.stdout.write(`fail ${slug}: ${e.message.slice(0, 160)}\n`);
  }
}
