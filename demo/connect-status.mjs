#!/usr/bin/env node
// Lists Composio connected accounts for the Open HQ demo user (status only, no credentials).
import { loadEnv, composio, USER_ID } from "./lib.mjs";

loadEnv();
const res = await composio(`/api/v3/connected_accounts?user_ids=${USER_ID}&limit=100`);
for (const a of res.items ?? []) {
  process.stdout.write(`${a.toolkit?.slug}\t${a.status}\t${a.id}\t${a.status_reason ?? ""}\n`);
}
if (!(res.items ?? []).length) process.stdout.write("no connected accounts yet\n");
