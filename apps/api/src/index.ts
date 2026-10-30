import { Hono } from "hono";
import { runCron } from "./cron";
import type { Env } from "./env";
import { clientIp } from "./http";
import { connectLive } from "./live";
import { rateLimit } from "./ratelimit";
import { chatRoutes } from "./routes/chat";
import { core } from "./routes/core";
import { hooks } from "./routes/hooks";
import { mcp } from "./routes/mcp";
import { proposalRoutes } from "./routes/proposals";
import { ApiErr } from "./util";

export { LiveHub } from "./live";
export { AgentRunWorkflow, WorkdayWorkflow } from "./workflow";

const app = new Hono<{ Bindings: Env }>();

// Public demo: per-IP limit on every write. Machine endpoints (ingest, webhooks, mcp) authenticate with their own secrets.
app.use("/api/*", async (c, next) => {
  const path = new URL(c.req.url).pathname;
  const exempt = path === "/api/ingest" || path.startsWith("/api/webhooks/");
  if (c.req.method !== "GET" && c.req.method !== "HEAD" && !exempt) await rateLimit(c.env, clientIp(c), "write", 20, 60);
  await next();
});

app.get("/api/live", (c) => {
  if (c.req.header("Upgrade") !== "websocket") return c.json({ error: "Expected a WebSocket upgrade", code: "upgrade_required" }, 426);
  return connectLive(c.env, c.req.raw);
});
app.get("/api/health", (c) => c.json({ ok: true, runtime: c.env.AGENT_RUNTIME ?? "loop" }));

app.route("/", core);
app.route("/", chatRoutes);
app.route("/", proposalRoutes);
app.route("/", hooks);
app.route("/", mcp);

app.notFound((c) => c.json({ error: "Not found", code: "not_found" }, 404));
app.onError((e, c) => {
  if (e instanceof ApiErr) return c.json({ error: e.message, code: e.code }, e.status as 400);
  return c.json({ error: "Something went wrong on our side", code: "internal" }, 500);
});

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runCron(env));
  },
} satisfies ExportedHandler<Env>;
