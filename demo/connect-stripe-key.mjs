#!/usr/bin/env node
// Connects the Stripe SANDBOX to Composio for user openhq-demo with an API key (no browser OAuth needed).
// Reads STRIPE_SANDBOX_SECRET_KEY (never printed); refuses anything that is not a test-mode key.
// Usage: node connect-stripe-key.mjs [--config-only]
import { loadEnv, composio, need, USER_ID } from "./lib.mjs";

loadEnv();
const configOnly = process.argv.includes("--config-only");
const NAME = "openhq-stripe-sandbox";

let key = "";
if (!configOnly) {
  key = need("STRIPE_SANDBOX_SECRET_KEY");
  if (!/^(sk|rk)_test_/.test(key)) {
    process.stderr.write("Refusing: not a test-mode Stripe key.\n");
    process.exit(1);
  }
}

const configs = (await composio("/api/v3/auth_configs?toolkit_slug=stripe&limit=50")).items ?? [];
let cfg = configs.find((c) => c.name === NAME);
if (!cfg) {
  const r = await composio("/api/v3/auth_configs", {
    method: "POST",
    body: JSON.stringify({ toolkit: { slug: "stripe" }, auth_config: { type: "use_custom_auth", authScheme: "API_KEY", name: NAME, credentials: {} } }),
  });
  cfg = r.auth_config ?? r;
  process.stdout.write(`created auth config ${NAME}\n`);
}
process.stdout.write(`auth config: ${cfg.id}\n`);
if (configOnly) process.exit(0);

const acct = await composio("/api/v3/connected_accounts", {
  method: "POST",
  body: JSON.stringify({ auth_config: { id: cfg.id }, connection: { user_id: USER_ID, state: { authScheme: "API_KEY", val: { generic_api_key: key } } } }),
});
process.stdout.write(`connected account ${acct.id} status ${acct.status}\n`);
