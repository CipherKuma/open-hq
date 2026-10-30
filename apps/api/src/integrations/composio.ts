// Thin Composio REST v3.1 client over fetch (runs on Workers; @composio/core is not needed).
import { IntegrationError, asEnv, userId, type IntegrationsEnv } from "./env";

const BASE = "https://backend.composio.dev";

export async function cx<T = any>(env: IntegrationsEnv, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(BASE + path, {
    ...init,
    headers: { "x-api-key": env.COMPOSIO_API_KEY, "content-type": "application/json", ...(init.headers ?? {}) },
  });
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text.slice(0, 200) }; }
  if (!res.ok) {
    const msg = body?.error?.message ?? body?.message ?? `Composio request failed (${res.status})`;
    throw new IntegrationError(String(msg).slice(0, 300), `composio_${res.status}`);
  }
  return body as T;
}

export interface SessionSpec {
  toolkits: string[];
  tools: Record<string, string[]>; // per-toolkit execution allowlist, enforced server-side by Composio
  disableDestructive: boolean; // tags.disable ["destructiveHint"]; true for every read session
  proxy?: boolean; // expose the GET-only proxy used for GitHub referrers
}
/**
 * Newest ACTIVE connected account per toolkit. Sessions only auto-pick accounts made through the default auth
 * config, and the GitHub connection here is imported with a bearer token under our own config, so every session
 * must pin its accounts or it fails with "No active connection found for toolkit(s) ...".
 */
export async function activePins(env: IntegrationsEnv, toolkits: string[]): Promise<Record<string, string>> {
  const pins: Record<string, string> = {};
  for (const a of (await listAccounts(env)).sort((x, y) => y.createdAt.localeCompare(x.createdAt))) {
    if (a.status === "ACTIVE" && toolkits.includes(a.toolkit) && !pins[a.toolkit]) pins[a.toolkit] = a.id;
  }
  return pins;
}

/** Re-pin an existing session in place (same id and MCP URL), e.g. after a connection was added or replaced. */
export async function repinSession(env: IntegrationsEnv, sessionId: string, toolkits: string[]): Promise<void> {
  const pins = await activePins(env, toolkits);
  if (Object.keys(pins).length) {
    await cx(env, `/api/v3.1/tool_router/session/${sessionId}`, { method: "PATCH", body: JSON.stringify({ connected_accounts: pins }) });
  }
}

export interface ComposioSession { id: string; mcpUrl: string }

export async function createSession(env: IntegrationsEnv, spec: SessionSpec): Promise<ComposioSession> {
  const body: Record<string, unknown> = {
    user_id: userId(env),
    toolkits: { enable: spec.toolkits },
    tools: Object.fromEntries(Object.entries(spec.tools).map(([k, v]) => [k, { enable: v }])),
    manage_connections: { enable: false },
    workbench: { enable: false },
    preload: { tools: "all" },
    search: { enable: false },
    execute: { enable_multi_execute: false },
  };
  if (spec.toolkits.length === 0) { delete body.preload; delete body.tools; }
  const pins = await activePins(env, spec.toolkits);
  if (Object.keys(pins).length) body.connected_accounts = pins;
  if (spec.disableDestructive) body.tags = { disable: ["destructiveHint"] };
  if (spec.proxy) body.proxy_execute = { enable: true };
  const r = await cx<{ session_id: string; mcp: { url: string } }>(env, "/api/v3.1/tool_router/session", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return { id: r.session_id, mcpUrl: r.mcp.url };
}

export async function sessionTools(env: IntegrationsEnv, id: string): Promise<Array<{ slug: string; description: string; tags?: string[]; input_parameters: Record<string, unknown> }>> {
  const r = await cx<{ items: any[] }>(env, `/api/v3.1/tool_router/session/${id}/tools`);
  return r.items ?? [];
}

export interface ExecOutcome { data: any; successful: boolean; error: string | null }

export async function sessionExecute(env: IntegrationsEnv, id: string, slug: string, args: unknown): Promise<ExecOutcome> {
  const r = await cx<any>(env, `/api/v3.1/tool_router/session/${id}/execute`, {
    method: "POST",
    body: JSON.stringify({ tool_slug: slug, arguments: args ?? {} }),
  });
  const ok = r?.successful !== false && !r?.error;
  return { data: r?.data ?? r, successful: ok, error: ok ? null : String(r?.error ?? "tool failed").slice(0, 300) };
}

export async function createLink(env: IntegrationsEnv, sessionId: string, toolkit: string, callbackUrl?: string): Promise<string> {
  const r = await cx<{ redirect_url: string }>(env, `/api/v3.1/tool_router/session/${sessionId}/link`, {
    method: "POST",
    body: JSON.stringify({ toolkit, ...(callbackUrl ? { callback_url: callbackUrl } : {}) }),
  });
  return r.redirect_url;
}

export interface ConnectedAccount { id: string; toolkit: string; status: string; createdAt: string }

export async function listAccounts(env: IntegrationsEnv): Promise<ConnectedAccount[]> {
  const r = await cx<{ items: any[] }>(env, `/api/v3/connected_accounts?user_ids=${encodeURIComponent(userId(env))}&limit=100`);
  return (r.items ?? []).map((a) => ({
    id: a.id,
    toolkit: String(a.toolkit?.slug ?? "").toLowerCase(),
    status: String(a.status),
    createdAt: String(a.created_at ?? ""),
  }));
}

// Session cache per isolate. Sessions are cheap to recreate; recreate once if Composio forgets one.
const sessions = new Map<string, Promise<ComposioSession>>();
export function cachedSession(env: IntegrationsEnv, key: string, spec: SessionSpec): Promise<ComposioSession> {
  let p = sessions.get(key);
  if (!p) {
    p = createSession(env, spec).catch((e) => { sessions.delete(key); throw e; });
    sessions.set(key, p);
  }
  return p;
}
export const forgetSession = (key: string) => void sessions.delete(key);

export async function runInSession(env: IntegrationsEnv, key: string, spec: SessionSpec, slug: string, args: unknown): Promise<ExecOutcome> {
  const s = await cachedSession(env, key, spec);
  try {
    return await sessionExecute(env, s.id, slug, args);
  } catch (e) {
    // Repin in place if the connection changed after the session was created; recreate if Composio forgot it.
    if (e instanceof IntegrationError && /No active connection/i.test(e.message)) {
      try {
        await repinSession(env, s.id, spec.toolkits);
        return await sessionExecute(env, s.id, slug, args);
      } catch { /* fall through to recreate */ }
    }
    if (e instanceof IntegrationError && (/composio_404/.test(e.code) || /No active connection/i.test(e.message))) {
      forgetSession(key);
      return sessionExecute(env, (await cachedSession(env, key, spec)).id, slug, args);
    }
    throw e;
  }
}

export { asEnv };
