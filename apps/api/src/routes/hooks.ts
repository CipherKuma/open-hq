import { AGENTS, AgentId } from "@open-hq/shared";
import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../env";
import { jsonBody } from "../http";
import { verifyComposioWebhook } from "../integrations";
import { dispatchJob } from "../jobs";
import { screenInbound } from "../screen";
import { logActivity } from "../store/activity";
import { addMessage } from "../store/messages";
import { createProposal } from "../store/proposals";
import { ApiErr, bearerOk, clip } from "../util";

export const hooks = new Hono<{ Bindings: Env }>();

const Items = z.array(z.object({ text: z.string().min(3).max(600), source: z.string().max(120).optional() })).min(1).max(50);
const Report = z.object({ summary: z.string().max(600), passed: z.number().optional(), failed: z.number().optional(), flagged: z.number().optional(), details: z.unknown().optional() });
export const IngestBody = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("memories"), job: z.string().max(80), agent: AgentId, items: Items }),
  z.object({ kind: z.literal("standing_orders"), job: z.string().max(80), agent: AgentId, items: Items }),
  z.object({ kind: z.literal("guardrail_report"), job: z.string().max(80), report: Report }),
  z.object({ kind: z.literal("safety_audit"), job: z.string().max(80), report: Report }),
]);

hooks.post("/api/ingest", async (c) => {
  if (!(await bearerOk(c.req.raw, c.env.INGEST_SECRET))) throw new ApiErr(401, "Invalid or missing bearer token", "unauthorized");
  const b = await jsonBody(c, IngestBody);
  if (b.kind === "memories" || b.kind === "standing_orders") {
    const kind = b.kind === "memories" ? "memory" : "standing_order";
    let created = 0;
    for (const it of b.items) {
      const r = await createProposal(c.env, {
        agent: b.agent, kind, level: "week", title: `${kind === "memory" ? "Remember" : "New standing order"}: ${clip(it.text, 90)}`,
        why: `Proposed by the Nebius job "${b.job}" after reviewing ${AGENTS[b.agent].name}'s week. Approve to save it.`,
        payload: { text: it.text, source: it.source ?? `nebius job ${b.job}` },
      });
      if (r.created) created++;
    }
    await logActivity(c.env, { agent: b.agent, kind: "job", runtime: "nebius_job", summary: `${b.job}: ${created} ${kind === "memory" ? "memories" : "standing orders"} proposed` });
    return c.json({ ok: true, created });
  }
  await logActivity(c.env, {
    agent: "system", kind: "job", runtime: "nebius_job",
    summary: `${b.job}: ${b.kind === "guardrail_report" ? "guardrails" : "safety audit"} - ${b.report.summary}`,
    detail: JSON.stringify(b.report).slice(0, 1800),
  });
  return c.json({ ok: true });
});

hooks.post("/api/webhooks/composio", async (c) => {
  let ev = null;
  try {
    ev = await verifyComposioWebhook(c.req.raw.clone(), c.env);
  } catch {
    ev = null;
  }
  if (!ev) return c.json({ ok: true, ignored: true }, 202);
  const text = `${ev.summary}\n${clip(JSON.stringify(ev.raw ?? ""), 5000)}`;
  const verdict = await screenInbound(c.env, { source: ev.source, agent: ev.agent, text });
  if (!verdict.safe) {
    await addMessage(c.env, { channelId: `dm:${ev.agent}`, author: "system", text: `Quarantined an inbound ${ev.source} message (${verdict.reason}). It was not shown to ${AGENTS[ev.agent].name}.` });
    return c.json({ ok: true, quarantined: true });
  }
  await dispatchJob(c.env, { kind: "event", agent: ev.agent, source: ev.source, summary: ev.summary, text });
  return c.json({ ok: true, dispatched: ev.agent });
});
