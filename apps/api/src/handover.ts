// The Chief of Staff's evening handover: since-summaries, ranked decisions, a to-do sized to ~80% of the founder window.
import { AGENTS, AgentId, Handover as HandoverSchema, TodoItem } from "@open-hq/shared";
import type { Handover } from "@open-hq/shared";
import { z } from "zod";
import type { Env } from "./env";
import { broadcast } from "./live";
import { MODELS } from "./models";
import { runAgent } from "./runtime";
import { extractJson } from "./runtime/nebius";
import { nextFounderWindow } from "./schedule";
import { SHIFT_AGENTS } from "./shifts";
import { logActivity } from "./store/activity";
import { postAgentMessage } from "./store/messages";
import { getProposals, pendingProposals } from "./store/proposals";
import { getSchedule } from "./store/workspace";
import { clip, errMessage, nowIso, parseJson, uid } from "./util";

const ModelOut = z.object({
  since: z.array(z.object({ agent: AgentId, text: z.string() })).default([]),
  todo: z.array(z.object({ title: z.string(), minutes: z.number().int().min(1).max(120), agent: AgentId.nullable().optional(), productId: z.string().nullable().optional() })).default([]),
  status: z.enum(["normal", "attention", "urgent"]).optional(),
});

export const MAX_PROMPT_CHARS = 60_000; // far under the 100K-token input ceiling

/** Keeps to-do items in priority order until the founder window is ~80% planned. */
export function fitTodo<T extends { minutes: number }>(items: T[], windowMinutes: number): T[] {
  const budget = Math.floor(windowMinutes * 0.8);
  const out: T[] = [];
  let used = 0;
  for (const it of items) {
    if (used + it.minutes > budget) continue;
    out.push(it);
    used += it.minutes;
  }
  return out;
}

async function material(env: Env): Promise<{ text: string; notesByAgent: Map<string, string> }> {
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const notes = await env.DB.prepare("SELECT agent, text FROM shift_notes WHERE created_at > ? ORDER BY created_at DESC LIMIT 40").bind(since)
    .all<{ agent: string; text: string }>();
  const byAgent = new Map<string, string>();
  for (const n of notes.results) {
    const prev = byAgent.get(n.agent) ?? "";
    if (prev.length < 2500) byAgent.set(n.agent, `${prev}${prev ? "\n" : ""}- ${clip(n.text, 800)}`);
  }
  const back = await env.DB.prepare(
    "SELECT author, text FROM messages WHERE channel_id LIKE 'backroom:%' AND created_at > ? ORDER BY created_at DESC LIMIT 20",
  ).bind(since).all<{ author: string; text: string }>();
  const pending = await pendingProposals(env);
  const text = [
    ...SHIFT_AGENTS.map((a) => `## ${AGENTS[a].name} shift notes (last 24h)\n${byAgent.get(a) ?? "No shift has run yet."}`),
    `## Back room (last 24h)\n${back.results.map((m) => `${m.author}: ${clip(m.text, 300)}`).join("\n") || "Quiet."}`,
    `## Pending decisions (${pending.length})\n${pending.map((p) => `- id=${p.id} level=${p.level} agent=${p.agent} product=${p.productId ?? "-"}: ${p.title}. Why: ${clip(p.why, 200)}`).join("\n") || "None."}`,
  ].join("\n\n");
  return { text: clip(text, MAX_PROMPT_CHARS), notesByAgent: byAgent };
}

export async function latestHandover(env: Env): Promise<Handover | null> {
  const row = await env.DB.prepare("SELECT json, decision_ids_json FROM handovers ORDER BY generated_at DESC LIMIT 1").first<{ json: string; decision_ids_json: string }>();
  if (!row) return null;
  const base = parseJson<Omit<Handover, "decisions">>(row.json, null as never);
  if (!base) return null;
  const decisions = await getProposals(env, parseJson<string[]>(row.decision_ids_json, []));
  const parsed = HandoverSchema.safeParse({ ...base, decisions });
  return parsed.success ? parsed.data : null;
}

export async function buildHandover(env: Env): Promise<Handover> {
  const schedule = await getSchedule(env);
  const now = new Date();
  const win = nextFounderWindow(schedule, now);
  const windowMinutes = win?.minutes ?? 240;
  const { text: mat, notesByAgent } = await material(env);
  const pending = await pendingProposals(env);
  const prompt = `Build tonight's handover for the founder. Their window is ${win ? `${win.start}-${win.end}` : "unknown"} (${windowMinutes} minutes). Plan about 80% of it (${Math.floor(windowMinutes * 0.8)} minutes) with to-do items ordered by priority, each with an honest minutes estimate; approving a decision card takes about 1 minute each.
Use only facts in the material below. If an agent has no data yet, say that plainly instead of guessing.
Answer with JSON only, no prose: {"since":[{"agent":"revenue|support|ship|scout","text":"2 sentences max"}],"todo":[{"title":"","minutes":10,"agent":"revenue|support|ship|scout|cos|null","productId":"tidyform|quillbill|null"}],"status":"normal|attention|urgent"}
Include one "since" entry for each of revenue, support, ship, scout.

${mat}`;
  let model: string = MODELS.ultra;
  let out: z.infer<typeof ModelOut> = { since: [], todo: [] };
  try {
    const r = await runAgent(env, { agent: "cos", trigger: "handover", channelId: "dm:cos", prompt, history: [], runId: uid("run") });
    model = r.model;
    const parsed = ModelOut.safeParse(extractJson(r.text));
    if (parsed.success) out = parsed.data;
    else await logActivity(env, { agent: "cos", kind: "job", runtime: "app", summary: "Handover JSON did not validate; using shift notes directly", detail: clip(r.text, 300) });
  } catch (e) {
    model = "fallback";
    await logActivity(env, { agent: "cos", kind: "job", runtime: "app", summary: "Handover model call failed; built from shift notes", detail: clip(errMessage(e), 300) });
  }

  const since = SHIFT_AGENTS.map((a) => ({
    agent: a,
    text: out.since.find((s) => s.agent === a)?.text || (notesByAgent.get(a) ? clip(notesByAgent.get(a)!, 400) : "No shift has run yet, so there is nothing to report."),
  }));
  if (!out.todo.length && pending.length) {
    out.todo = [{ title: `Review ${pending.length} pending decision${pending.length === 1 ? "" : "s"}`, minutes: Math.min(60, pending.length * 2), agent: "cos", productId: null }];
  }
  const todo = fitTodo(out.todo, windowMinutes).map((t) => TodoItem.parse({ id: uid("todo"), title: t.title, minutes: t.minutes, agent: t.agent ?? null, productId: t.productId ?? null, done: false }));
  const status = pending.some((p) => p.level === "urgent") ? "urgent" : out.status ?? (pending.length ? "attention" : "normal");
  const base: Omit<Handover, "decisions"> = {
    date: win?.date ?? now.toISOString().slice(0, 10),
    window: { start: win?.start ?? "19:00", end: win?.end ?? "23:00", minutes: windowMinutes },
    since, todo, plannedMinutes: todo.reduce((s, t) => s + t.minutes, 0), status, generatedAt: nowIso(), model,
  };
  await env.DB.prepare("INSERT INTO handovers (date, json, decision_ids_json, generated_at) VALUES (?,?,?,?) ON CONFLICT(date) DO UPDATE SET json = excluded.json, decision_ids_json = excluded.decision_ids_json, generated_at = excluded.generated_at")
    .bind(base.date, JSON.stringify(base), JSON.stringify(pending.map((p) => p.id)), base.generatedAt).run();
  const handover: Handover = { ...base, decisions: pending };
  await broadcast(env, { type: "handover", data: handover });
  await postAgentMessage(env, {
    agent: "cos", channelId: "dm:cos", level: "tonight", prompted: false,
    text: `Tonight's handover is ready: ${pending.length} decision${pending.length === 1 ? "" : "s"}, ${base.plannedMinutes} of your ${windowMinutes} minutes planned.`,
  });
  return handover;
}
