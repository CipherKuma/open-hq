import type { ActivityEntry } from "@open-hq/shared";
import type { Env } from "../env";
import { broadcast } from "../live";
import { nowIso, uid } from "../util";

interface ActRow {
  id: string; at: string; agent: string; kind: string; summary: string; model: string | null;
  tokens_in: number | null; tokens_out: number | null; usd: number | null; ms: number | null;
  runtime: string | null; detail: string | null;
}

export const toActivity = (r: ActRow): ActivityEntry => ({
  id: r.id, at: r.at, agent: r.agent as ActivityEntry["agent"], kind: r.kind as ActivityEntry["kind"],
  summary: r.summary, model: r.model, tokensIn: r.tokens_in, tokensOut: r.tokens_out, usd: r.usd,
  ms: r.ms, runtime: r.runtime as ActivityEntry["runtime"], detail: r.detail,
});

export type ActivityInput = Partial<Omit<ActivityEntry, "id" | "at">> &
  Pick<ActivityEntry, "agent" | "kind" | "summary"> & { runId?: string };

export async function logActivity(env: Env, a: ActivityInput): Promise<ActivityEntry> {
  const entry: ActivityEntry = {
    id: uid("act"), at: nowIso(), agent: a.agent, kind: a.kind, summary: a.summary.slice(0, 400),
    model: a.model ?? null, tokensIn: a.tokensIn ?? null, tokensOut: a.tokensOut ?? null,
    usd: a.usd ?? null, ms: a.ms ?? null, runtime: a.runtime ?? null, detail: a.detail?.slice(0, 2000) ?? null,
  };
  await env.DB.prepare(
    "INSERT INTO activity (id, at, agent, kind, summary, model, tokens_in, tokens_out, usd, ms, runtime, detail, run_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
  ).bind(entry.id, entry.at, entry.agent, entry.kind, entry.summary, entry.model, entry.tokensIn, entry.tokensOut,
    entry.usd, entry.ms, entry.runtime, entry.detail, a.runId ?? null).run();
  await broadcast(env, { type: "activity", data: entry });
  return entry;
}

export async function listActivity(env: Env, agent: string | null, limit: number): Promise<ActivityEntry[]> {
  const q = agent
    ? env.DB.prepare("SELECT * FROM activity WHERE agent = ? ORDER BY at DESC LIMIT ?").bind(agent, limit)
    : env.DB.prepare("SELECT * FROM activity ORDER BY at DESC LIMIT ?").bind(limit);
  const { results } = await q.all<ActRow>();
  return results.map(toActivity);
}
