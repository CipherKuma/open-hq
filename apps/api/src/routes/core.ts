import { AgentId, Dashboard, Schedule } from "@open-hq/shared";
import type { Workspace } from "@open-hq/shared";
import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../env";
import { jsonBody, parse } from "../http";
import { dashboardData, linkConnection, listConnections } from "../integrations";
import { isValidTimezone } from "../schedule";
import { listActivity } from "../store/activity";
import { agentProfile } from "../store/agents";
import { getProducts, getSchedule } from "../store/workspace";
import { ApiErr, errMessage } from "../util";

export const core = new Hono<{ Bindings: Env }>();

core.get("/api/workspace", async (c) => {
  const env = c.env;
  const [ws, products, schedule, agents] = await Promise.all([
    env.DB.prepare("SELECT id, founder FROM workspace LIMIT 1").first<{ id: string; founder: string }>(),
    getProducts(env),
    getSchedule(env),
    env.DB.prepare("SELECT id, name, status, last_run_at FROM agents ORDER BY CASE id WHEN 'cos' THEN 0 WHEN 'revenue' THEN 1 WHEN 'support' THEN 2 WHEN 'ship' THEN 3 ELSE 4 END")
      .all<{ id: AgentId; name: string; status: "idle" | "working" | "waiting"; last_run_at: string | null }>(),
  ]);
  const body: Workspace = {
    id: ws?.id ?? "ws_main", founder: ws?.founder ?? "Cipher Kuma", products, schedule,
    agents: agents.results.map((a) => ({ id: a.id, name: a.name, status: a.status, lastRunAt: a.last_run_at })),
  };
  return c.json(body);
});

core.get("/api/schedule", async (c) => c.json(await getSchedule(c.env)));
core.put("/api/schedule", async (c) => {
  const s = await jsonBody(c, Schedule);
  if (!isValidTimezone(s.timezone)) throw new ApiErr(400, `Unknown timezone ${s.timezone}`, "invalid_timezone");
  await c.env.DB.prepare("UPDATE workspace SET schedule_json = ?").bind(JSON.stringify(s)).run();
  return c.json(s);
});

core.get("/api/agents/:id", async (c) => {
  const id = parse(AgentId, c.req.param("id"));
  const p = await agentProfile(c.env, id);
  if (!p) throw new ApiErr(404, "Agent not found", "not_found");
  return c.json(p);
});

core.get("/api/activity", async (c) => {
  const q = parse(z.object({ agent: AgentId.or(z.literal("system")).optional(), limit: z.coerce.number().int().min(1).max(200).default(50) }), c.req.query());
  return c.json(await listActivity(c.env, q.agent ?? null, q.limit));
});

core.get("/api/connections", async (c) => {
  try {
    return c.json(await listConnections(c.env));
  } catch {
    return c.json([]);
  }
});

core.post("/api/connections/:toolkit/link", async (c) => {
  const toolkit = parse(z.string().regex(/^[a-z0-9_-]{1,40}$/), c.req.param("toolkit"));
  try {
    return c.json(await linkConnection(toolkit, c.env));
  } catch (e) {
    throw new ApiErr(502, `Could not start the ${toolkit} connection: ${errMessage(e).slice(0, 160)}`, "integration_unavailable");
  }
});

core.get("/api/products/:id/dashboard", async (c) => {
  const id = c.req.param("id");
  const product = (await getProducts(c.env)).find((p) => p.id === id);
  if (!product) throw new ApiErr(404, "Product not found", "not_found");
  try {
    return c.json(Dashboard.parse(await dashboardData(id, c.env)));
  } catch {
    const empty: Dashboard = {
      product, mrr: { value: 0, delta: 0, series: [] }, customers: { value: 0, delta: 0 }, failedPayments: 0, deploys: [],
      errorRate: { value: 0, series: [] }, openTickets: 0, traffic: { value: 0, delta: 0, series: [] },
      source: { note: "No data source is connected yet for this product" },
    };
    return c.json(empty);
  }
});
