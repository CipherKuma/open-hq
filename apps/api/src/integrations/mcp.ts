// Per-agent read-only Composio MCP endpoint for the Hermes runtime. The session carries the same
// server-side allowlist and destructive-tool block as the loop runtime's read session.
import type { AgentId } from "@open-hq/shared";
import { READ_ALLOWLIST } from "./allowlists";
import { createSession, repinSession } from "./composio";
import { asEnv } from "./env";
import { readSpec } from "./read";

const cache = new Map<AgentId, Promise<{ id: string; url: string }>>();

export async function hermesMcpConfig(agent: AgentId, env: unknown): Promise<{ url: string; headers: Record<string, string> }> {
  const e = asEnv(env);
  // Privacy: Composio's MCP cannot force the Gmail search scope, so Support gets an empty Composio MCP.
  // Hermes reads support mail through Open HQ's own read tool, which calls callReadTool (scoped).
  const reads = agent === "support" ? { toolkits: [], tools: {}, custom: [] } : READ_ALLOWLIST[agent];
  let p = cache.get(agent);
  if (!p) {
    p = createSession(e, readSpec(reads)).then((s) => ({ id: s.id, url: s.mcpUrl })).catch((err) => { cache.delete(agent); throw err; });
    cache.set(agent, p);
  }
  const session = await p;
  // Keep the session pinned to the current ACTIVE connections (same URL), so connections added later just work.
  if (reads.toolkits.length) await repinSession(e, session.id, reads.toolkits).catch(() => undefined);
  // Composio authenticates MCP calls with the project key; treat this config as a secret (Hermes host only).
  return { url: session.url, headers: { "x-api-key": e.COMPOSIO_API_KEY } };
}
