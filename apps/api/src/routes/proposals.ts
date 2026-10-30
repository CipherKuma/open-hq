import { Decision, ProposalStatus } from "@open-hq/shared";
import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../env";
import { jsonBody, parse, clientIp } from "../http";
import { buildHandover, latestHandover } from "../handover";
import { dispatchJob } from "../jobs";
import { decide } from "../proposals";
import { rateLimit } from "../ratelimit";
import { listProposals } from "../store/proposals";
import { ApiErr, nowIso, uid } from "../util";

export const proposalRoutes = new Hono<{ Bindings: Env }>();

proposalRoutes.get("/api/proposals", async (c) => {
  const q = parse(z.object({ status: ProposalStatus.optional() }), c.req.query());
  return c.json(await listProposals(c.env, q.status ?? null));
});

proposalRoutes.post("/api/proposals/:id/decision", async (c) => {
  const d = await jsonBody(c, Decision);
  const p = await decide(c.env, c.req.param("id"), d.decision, d.payloadHash, async (id) => {
    await dispatchJob(c.env, { kind: "execute", proposalId: id });
  });
  return c.json(p);
});

proposalRoutes.get("/api/handover", async (c) => {
  const q = parse(z.object({ regenerate: z.string().optional() }), c.req.query());
  if (q.regenerate) {
    await rateLimit(c.env, clientIp(c), "regen", 3, 3600); // each regeneration is an Ultra call
    return c.json(await buildHandover(c.env));
  }
  const h = await latestHandover(c.env);
  if (!h) throw new ApiErr(404, "No handover yet; add ?regenerate=1 to build one now", "no_handover");
  return c.json(h);
});

proposalRoutes.post("/api/demo/workday", async (c) => {
  const env = c.env;
  const running = await env.DB.prepare("SELECT id FROM workday_runs WHERE status = 'running' AND started_at > ? LIMIT 1")
    .bind(new Date(Date.now() - 15 * 60_000).toISOString()).first<{ id: string }>();
  if (running) return c.json({ runId: running.id });
  await rateLimit(env, clientIp(c), "workday", 3, 3600);
  if (!env.WORKDAY) throw new ApiErr(503, "Workflows are not available in this environment", "workflow_unavailable");
  const runId = uid("wd");
  await env.DB.prepare("INSERT INTO workday_runs (id, status, started_at) VALUES (?, 'running', ?)").bind(runId, nowIso()).run();
  await env.WORKDAY.create({ id: runId, params: { runId } });
  return c.json({ runId }, 202);
});
