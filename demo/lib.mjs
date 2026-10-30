// Shared helpers for the demo CLI scripts. Reads secrets from process.env or an env file
// (default ./.env.local, or $ENV_FILE) that ~/.claude/vault/inject.sh wrote. Never prints values.
import { readFileSync, existsSync } from "node:fs";

export function loadEnv() {
  for (const file of [process.env.ENV_FILE, ".env.local", ".dev.vars", "../apps/api/.dev.vars"]) {
    if (!file || !existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
    }
  }
}

export function need(name) {
  const v = process.env[name];
  if (!v) {
    process.stderr.write(`Missing ${name}. Run: ~/.claude/vault/inject.sh get ${name} --dir <dir> and set ENV_FILE=<dir>/.env.local\n`);
    process.exit(1);
  }
  return v;
}

export const COMPOSIO = "https://backend.composio.dev";
export const USER_ID = "openhq-demo";

export async function composio(path, init = {}) {
  let res;
  for (let attempt = 0; ; attempt++) {
    try {
      res = await fetch(COMPOSIO + path, {
        ...init,
        headers: { "x-api-key": need("COMPOSIO_API_KEY"), "content-type": "application/json", ...(init.headers ?? {}) },
        signal: AbortSignal.timeout(20000),
      });
      break;
    } catch (e) {
      if (attempt >= 4) throw e; // flaky networks: retry connection failures only
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 300) }; }
  if (!res.ok) throw new Error(`Composio ${res.status} ${path}: ${JSON.stringify(body).slice(0, 300)}`);
  return body;
}

export async function session(toolkits) {
  return composio("/api/v3.1/tool_router/session", {
    method: "POST",
    body: JSON.stringify({ user_id: USER_ID, toolkits: { enable: toolkits } }),
  });
}
