import type { Level, Proposal } from "@open-hq/shared";
import type { Env } from "../env";
import { broadcast } from "../live";
import { nowIso, parseJson, payloadHashOf, uid } from "../util";

interface PropRow {
  id: string; agent: string; product_id: string | null; kind: string; title: string; why: string;
  payload_json: string; payload_hash: string; status: string; level: string; created_at: string;
  decided_at: string | null; result_json: string | null; depends_on: string | null;
}

export const toProposal = (r: PropRow): Proposal => ({
  id: r.id, agent: r.agent as Proposal["agent"], productId: r.product_id, kind: r.kind as Proposal["kind"],
  title: r.title, why: r.why, payload: parseJson(r.payload_json, {}), payloadHash: r.payload_hash,
  status: r.status as Proposal["status"], level: r.level as Level, createdAt: r.created_at, decidedAt: r.decided_at,
  result: parseJson(r.result_json, null), dependsOn: r.depends_on,
});

const LEVEL_RANK = "CASE level WHEN 'urgent' THEN 0 WHEN 'tonight' THEN 1 ELSE 2 END";

export async function listProposals(env: Env, status: string | null): Promise<Proposal[]> {
  const q = status
    ? env.DB.prepare(`SELECT * FROM proposals WHERE status = ? ORDER BY ${LEVEL_RANK}, created_at DESC LIMIT 200`).bind(status)
    : env.DB.prepare(`SELECT * FROM proposals ORDER BY created_at DESC LIMIT 200`);
  const { results } = await q.all<PropRow>();
  return results.map(toProposal);
}

export async function getProposal(env: Env, id: string): Promise<Proposal | null> {
  const r = await env.DB.prepare("SELECT * FROM proposals WHERE id = ?").bind(id).first<PropRow>();
  return r ? toProposal(r) : null;
}

export async function getProposals(env: Env, ids: string[]): Promise<Proposal[]> {
  if (!ids.length) return [];
  const { results } = await env.DB.prepare(
    `SELECT * FROM proposals WHERE id IN (${ids.map(() => "?").join(",")}) ORDER BY ${LEVEL_RANK}, created_at`,
  ).bind(...ids).all<PropRow>();
  return results.map(toProposal);
}

export async function pendingProposals(env: Env): Promise<Proposal[]> {
  return listProposals(env, "pending");
}

export interface NewProposal {
  agent: Proposal["agent"]; kind: Proposal["kind"]; title: string; why: string; payload: Record<string, unknown>;
  level: Level; productId?: string | null; dependsOn?: string | null;
}

/** Stores a proposal with payloadHash = sha256(canonical JSON of payload). Identical pending proposals dedupe. */
export async function createProposal(env: Env, p: NewProposal): Promise<{ proposal: Proposal; created: boolean }> {
  const payloadHash = await payloadHashOf(p.payload);
  const dup = await env.DB.prepare(
    "SELECT * FROM proposals WHERE agent = ? AND kind = ? AND payload_hash = ? AND status IN ('pending','approved','executing') LIMIT 1",
  ).bind(p.agent, p.kind, payloadHash).first<PropRow>();
  if (dup) return { proposal: toProposal(dup), created: false };
  const id = uid("prop");
  const at = nowIso();
  await env.DB.prepare(
    "INSERT INTO proposals (id, agent, product_id, kind, title, why, payload_json, payload_hash, status, level, created_at, depends_on) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
  ).bind(id, p.agent, p.productId ?? null, p.kind, p.title, p.why, JSON.stringify(p.payload), payloadHash, "pending",
    p.level, at, p.dependsOn ?? null).run();
  const proposal = (await getProposal(env, id))!;
  await broadcast(env, { type: "proposal", data: proposal });
  return { proposal, created: true };
}

export async function setStatus(
  env: Env, id: string, from: string[], to: Proposal["status"], result?: Proposal["result"],
): Promise<boolean> {
  const decided = to === "pending" ? null : nowIso();
  const res = await env.DB.prepare(
    `UPDATE proposals SET status = ?, decided_at = COALESCE(decided_at, ?), result_json = COALESCE(?, result_json)
     WHERE id = ? AND status IN (${from.map(() => "?").join(",")})`,
  ).bind(to, decided, result ? JSON.stringify(result) : null, id, ...from).run();
  const ok = (res.meta.changes ?? 0) > 0;
  if (ok) {
    const p = await getProposal(env, id);
    if (p) await broadcast(env, { type: "proposal", data: p });
  }
  return ok;
}
