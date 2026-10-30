// Open HQ MCP server (Streamable HTTP, JSON responses). Hermes agents call the internal tools here.
// Auth: bearer MCP_TOKEN. Header x-openhq-agent selects the caller. The caller's active run supplies trigger and channel.
import { AgentId } from "@open-hq/shared";
import { Hono } from "hono";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { Env } from "../env";
import type { Trigger } from "../runtime/types";
import { callReadTool, readToolsFor } from "../integrations";
import { logActivity } from "../store/activity";
import { INTERNAL_TOOLS, callInternalTool, type ToolCtx } from "../tools/internal";
import { bearerOk, uid } from "../util";

export const mcp = new Hono<{ Bindings: Env }>();

const Rpc = z.object({ jsonrpc: z.literal("2.0"), id: z.union([z.string(), z.number()]).nullable().optional(), method: z.string(), params: z.record(z.unknown()).optional() });
const ok = (id: unknown, result: unknown) => ({ jsonrpc: "2.0", id, result });
const fail = (id: unknown, code: number, message: string) => ({ jsonrpc: "2.0", id, error: { code, message } });

async function callerCtx(env: Env, agent: AgentId, req: Request): Promise<ToolCtx> {
  const run = await env.DB.prepare("SELECT id, trigger, channel_id FROM agent_runs WHERE agent = ? AND finished_at IS NULL ORDER BY started_at DESC LIMIT 1")
    .bind(agent).first<{ id: string; trigger: Trigger; channel_id: string | null }>();
  return {
    env, agent, runId: req.headers.get("x-openhq-run") ?? run?.id ?? uid("mcp"),
    trigger: run?.trigger ?? "shift", channelId: req.headers.get("x-openhq-channel") ?? run?.channel_id ?? null,
  };
}

async function handle(env: Env, agent: AgentId, req: Request, msg: unknown): Promise<unknown | null> {
  const parsed = Rpc.safeParse(msg);
  if (!parsed.success) return fail(null, -32600, "Invalid JSON-RPC request");
  const { id, method, params } = parsed.data;
  if (id === undefined) return null; // notification (e.g. notifications/initialized)
  switch (method) {
    case "initialize":
      return ok(id, {
        protocolVersion: typeof params?.protocolVersion === "string" ? params.protocolVersion : "2025-03-26",
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "openhq", version: "0.1.0" },
        instructions: "Open HQ tools for a founder's agents. You can only propose actions; the founder approves them.",
      });
    case "ping": return ok(id, {});
    case "tools/list": {
      // Internal tools plus this agent's read-only connection tools (scoped and enforced by the integrations module).
      const reads = await readToolsFor(agent, env).catch(() => []);
      return ok(id, { tools: [
        ...INTERNAL_TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: zodToJsonSchema(t.schema, { target: "openApi3" }) })),
        ...reads.map((t) => ({ name: t.function.name, description: t.function.description, inputSchema: t.function.parameters })),
      ] });
    }
    case "tools/call": {
      const name = typeof params?.name === "string" ? params.name : "";
      const started = Date.now();
      const ctx = await callerCtx(env, agent, req);
      const log = (isError: boolean) => logActivity(env, {
        agent, kind: "tool_call", runtime: "hermes", ms: Date.now() - started, runId: ctx.runId,
        summary: `${name}${isError ? " (error)" : ""}`, detail: JSON.stringify(params?.arguments ?? {}).slice(0, 600),
      }).catch(() => undefined);
      if (!INTERNAL_TOOLS.some((t) => t.name === name)) {
        const read = await callReadTool(agent, name, params?.arguments ?? {}, env).then((r) => ({ r }), (e: unknown) => ({ e: e instanceof Error ? e.message : "read failed" }));
        await log("e" in read);
        if ("e" in read) return ok(id, { content: [{ type: "text", text: JSON.stringify({ error: read.e }) }], isError: true });
        return ok(id, { content: [{ type: "text", text: JSON.stringify(read.r).slice(0, 60_000) }], isError: false });
      }
      const result = await callInternalTool(ctx, name, params?.arguments ?? {});
      const isError = typeof result === "object" && result !== null && "error" in result;
      await log(isError);
      return ok(id, { content: [{ type: "text", text: JSON.stringify(result) }], isError });
    }
    default: return fail(id, -32601, `Method not found: ${method}`);
  }
}

mcp.get("/mcp", (c) => c.json({ error: "Use POST", code: "method_not_allowed" }, 405));

mcp.post("/mcp", async (c) => {
  if (!(await bearerOk(c.req.raw, c.env.MCP_TOKEN))) return c.json({ error: "Invalid or missing bearer token", code: "unauthorized" }, 401);
  const agent = AgentId.safeParse(c.req.header("x-openhq-agent"));
  if (!agent.success) return c.json({ error: "Header x-openhq-agent must be one of cos, revenue, support, ship, scout", code: "invalid_agent" }, 400);
  const body = await c.req.json().catch(() => null);
  if (body === null) return c.json(fail(null, -32700, "Parse error"), 400);
  if (Array.isArray(body)) {
    const out = (await Promise.all(body.map((m) => handle(c.env, agent.data, c.req.raw, m)))).filter((r) => r !== null);
    return out.length ? c.json(out) : new Response(null, { status: 202 });
  }
  const res = await handle(c.env, agent.data, c.req.raw, body);
  return res === null ? new Response(null, { status: 202 }) : c.json(res);
});
