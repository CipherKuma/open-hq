// Agent READ tools: schemas in OpenAI function format and allowlist-enforced execution.
import type { AgentId } from "@open-hq/shared";
import { GITHUB_REFERRERS, READ_ALLOWLIST, WEB_FETCH, allowedFor, type AgentReads } from "./allowlists";
import { cachedSession, cx, listAccounts, runInSession, sessionTools, type SessionSpec } from "./composio";
import { IntegrationError, asEnv, demoRepo, type IntegrationsEnv } from "./env";
import { assertInScope, isGmailTool, scopeGmailArgs } from "./gmailscope";
import type { OpenAITool } from "./types";
import { WEB_FETCH_SCHEMA, webFetch } from "./webfetch";

const MAX_RESULT_CHARS = 24_000;
export const lastRead = new Map<string, string>(); // toolkit -> ISO time of the last successful agent read (per isolate)

export function readSpec(reads: AgentReads): SessionSpec {
  return { toolkits: reads.toolkits, tools: reads.tools, disableDestructive: true };
}

// Drop schema noise (examples, titles) and long descriptions: these go into every model prompt.
function slim(node: any): any {
  if (Array.isArray(node)) return node.map(slim);
  if (!node || typeof node !== "object") return node;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node)) {
    if (k === "examples" || k === "title" || k === "example") continue;
    out[k] = k === "description" && typeof v === "string" ? v.slice(0, 220) : slim(v);
  }
  return out;
}

const TOOL_TTL_MS = 60_000;
const toolCache = new Map<AgentId, { at: number; tools: Promise<OpenAITool[]> }>();

export async function readToolsFor(agent: AgentId, env: unknown): Promise<OpenAITool[]> {
  const reads = READ_ALLOWLIST[agent];
  if (!reads || (reads.toolkits.length === 0 && reads.custom.length === 0)) return [];
  const e = asEnv(env);
  let hit = toolCache.get(agent);
  if (!hit || Date.now() - hit.at > TOOL_TTL_MS) {
    hit = { at: Date.now(), tools: build(agent, e, reads).catch((err) => { toolCache.delete(agent); throw err; }) };
    toolCache.set(agent, hit);
  }
  return hit.tools;
}

async function build(agent: AgentId, env: IntegrationsEnv, reads: AgentReads): Promise<OpenAITool[]> {
  const tools: OpenAITool[] = [];
  if (reads.toolkits.length) {
    const s = await cachedSession(env, `read:${agent}`, readSpec(reads));
    const allow = allowedFor(agent);
    // Only offer tools for toolkits that are actually connected, so agents never try a dead one.
    const connected = new Set((await listAccounts(env)).filter((a) => a.status === "ACTIVE").map((a) => a.toolkit));
    for (const t of await sessionTools(env, s.id)) {
      if (!connected.has(t.slug.split("_")[0].toLowerCase())) continue;
      if (!allow.has(t.slug)) continue; // belt and braces: never expose anything off the list
      // Composio's tags.disable does not remove explicitly enabled slugs, so also check the tags here.
      if ((t.tags ?? []).some((g) => /^(destructive|create|update)Hint$/.test(g))) continue;
      tools.push({
        type: "function",
        function: {
          name: t.slug,
          description: String(t.description ?? t.slug).slice(0, 300),
          parameters: slim(t.input_parameters ?? { type: "object", properties: {} }),
        },
      });
    }
  }
  if (reads.custom.includes(WEB_FETCH)) {
    tools.push({
      type: "function",
      function: {
        name: WEB_FETCH,
        description: "Fetch a public web page (GET only, text extracted, size capped). Use for competitor pricing and landing pages.",
        parameters: WEB_FETCH_SCHEMA as unknown as Record<string, unknown>,
      },
    });
  }
  if (reads.custom.includes(GITHUB_REFERRERS)) {
    tools.push({
      type: "function",
      function: {
        name: GITHUB_REFERRERS,
        description: "Top referrers sending traffic to the product's GitHub repository (last 14 days).",
        parameters: { type: "object", properties: {} },
      },
    });
  }
  return tools;
}

const HEADERS_KEEP = new Set(["from", "to", "cc", "subject", "date", "message-id", "reply-to", "in-reply-to"]);

/** Shrink tool output before it reaches a model: drop API link noise and raw mail headers. */
export function compact(node: any, depth = 0): any {
  if (Array.isArray(node)) return node.map((n) => compact(n, depth + 1));
  if (!node || typeof node !== "object") return typeof node === "string" && node.length > 3000 ? node.slice(0, 3000) + "..." : node;
  const out: Record<string, unknown> = {};
  if (Array.isArray(node.payload?.headers)) {
    const h: Record<string, string> = {};
    for (const x of node.payload.headers) if (HEADERS_KEEP.has(String(x.name).toLowerCase())) h[String(x.name).toLowerCase()] = String(x.value).slice(0, 300);
    out.headers = h;
  }
  for (const [k, v] of Object.entries(node)) {
    if (k === "payload" && out.headers) continue;
    if (/_url$/.test(k) && k !== "html_url") continue; // avatar_url, events_url, ... are noise
    if (/^(node_id|gravatar_id|url|_links|permissions)$/.test(k)) continue;
    out[k] = compact(v, depth + 1);
  }
  return out;
}

function cap(value: unknown): unknown {
  value = compact(value);
  const s = JSON.stringify(value ?? null);
  if (s.length <= MAX_RESULT_CHARS) return value;
  return { truncated: true, note: "Result too large; narrow the query (limit, since, query).", preview: s.slice(0, MAX_RESULT_CHARS) };
}

// No Composio tool exposes GitHub's referrer traffic, so this one GET goes through the session proxy.
// The path is fixed here; agents supply no arguments.
export async function githubReferrers(env: IntegrationsEnv): Promise<unknown> {
  const { owner, repo } = demoRepo(env);
  const spec: SessionSpec = { toolkits: ["github"], tools: {}, disableDestructive: false, proxy: true };
  const s = await cachedSession(env, "proxy:github", spec);
  const r = await cx<any>(env, `/api/v3.1/tool_router/session/${s.id}/proxy_execute`, {
    method: "POST",
    body: JSON.stringify({ toolkit_slug: "github", endpoint: `/repos/${owner}/${repo}/traffic/popular/referrers`, method: "GET" }),
  });
  return r?.data ?? r;
}

export async function callReadTool(agent: AgentId, name: string, args: unknown, env: unknown): Promise<unknown> {
  if (!allowedFor(agent).has(name)) {
    throw new IntegrationError(`Tool ${name} is not available to the ${agent} agent`, "tool_not_allowed");
  }
  const reads = READ_ALLOWLIST[agent];
  if (name === WEB_FETCH) return cap(await webFetch(args));
  const e = asEnv(env);
  if (name === GITHUB_REFERRERS) return cap(await githubReferrers(e));
  const spec = readSpec(reads);
  let sendArgs: unknown = args;
  if (isGmailTool(name)) {
    const scoped = scopeGmailArgs(name, args);
    await assertInScope(e, `read:${agent}`, spec, name, scoped);
    sendArgs = scoped;
  }
  const out = await runInSession(e, `read:${agent}`, spec, name, sendArgs);
  if (!out.successful) throw new IntegrationError(out.error ?? "Tool call failed", "tool_failed");
  const toolkit = name.split("_")[0].toLowerCase();
  lastRead.set(toolkit, new Date().toISOString());
  return cap(out.data);
}
