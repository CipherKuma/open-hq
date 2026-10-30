#!/usr/bin/env node
// Connects GitHub to Composio for user openhq-demo using CIPHERKUMA_GITHUB_PAT instead of browser OAuth.
// Composio's GitHub toolkit only offers OAUTH2, but its "import existing connections" feature accepts a bearer
// token for OAuth toolkits: this registers a BEARER_TOKEN auth config and attaches the PAT. The PAT is never printed.
import { loadEnv, composio, need, USER_ID } from "./lib.mjs";

loadEnv();
const pat = need("CIPHERKUMA_GITHUB_PAT");
const NAME = "openhq-github-bearer";

const me = await (await fetch("https://api.github.com/user", { headers: { authorization: `Bearer ${pat}`, "user-agent": "openhq-demo" } })).json();
if (me.login !== "CipherKuma") {
  process.stderr.write(`Token belongs to "${me.login}", expected CipherKuma. Aborting.\n`);
  process.exit(1);
}
const configs = (await composio("/api/v3/auth_configs?toolkit_slug=github&limit=50")).items ?? [];
let cfg = configs.find((c) => c.name === NAME);
if (!cfg) {
  const r = await composio("/api/v3/auth_configs", {
    method: "POST",
    body: JSON.stringify({
      toolkit: { slug: "github" },
      auth_config: { type: "use_custom_auth", authScheme: "BEARER_TOKEN", name: NAME, credentials: {} },
    }),
  });
  cfg = r.auth_config ?? r;
  process.stdout.write(`created auth config ${NAME}\n`);
}
const acct = await composio("/api/v3.1/connected_accounts", {
  method: "POST",
  body: JSON.stringify({
    auth_config: { id: cfg.id },
    connection: { user_id: USER_ID, state: { authScheme: "BEARER_TOKEN", val: { status: "ACTIVE", token: pat } } },
  }),
});
process.stdout.write(`connected account ${acct.id} status ${acct.status}\n`);
