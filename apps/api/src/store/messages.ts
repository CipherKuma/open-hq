import type { AgentId, Level, Message } from "@open-hq/shared";
import { AgentId as AgentIdSchema } from "@open-hq/shared";
import type { Env } from "../env";
import { broadcast } from "../live";
import { isHeldDuringWork } from "../schedule";
import { nowIso, parseJson, uid } from "../util";
import { getSchedule } from "./workspace";

export interface MsgRow {
  id: string; channel_id: string; author: string; text: string; created_at: string; held: number;
  level: string | null; proposal_id: string | null; mentions_json: string; refs_json: string;
}

export const toMessage = (r: MsgRow): Message => ({
  id: r.id, channelId: r.channel_id, author: r.author as Message["author"], text: r.text, createdAt: r.created_at,
  heldDuringWork: !!r.held, level: (r.level as Level | null) ?? null, proposalId: r.proposal_id,
  mentions: parseJson(r.mentions_json, []), refs: parseJson(r.refs_json, []),
});

export interface NewMessage {
  channelId: string; author: Message["author"]; text: string; level?: Level | null; proposalId?: string | null;
  mentions?: AgentId[]; refs?: Message["refs"]; held?: boolean; runId?: string | null;
}

export async function addMessage(env: Env, m: NewMessage): Promise<Message> {
  const id = uid("msg");
  const at = nowIso();
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO messages (id, channel_id, author, text, created_at, held, level, proposal_id, mentions_json, refs_json, run_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
    ).bind(id, m.channelId, m.author, m.text, at, m.held ? 1 : 0, m.level ?? null, m.proposalId ?? null,
      JSON.stringify(m.mentions ?? []), JSON.stringify(m.refs ?? []), m.runId ?? null),
    env.DB.prepare("UPDATE channels SET last_at = ? WHERE id = ?").bind(at, m.channelId),
  ]);
  const msg: Message = {
    id, channelId: m.channelId, author: m.author, text: m.text, createdAt: at, heldDuringWork: !!m.held,
    level: m.level ?? null, proposalId: m.proposalId ?? null, mentions: m.mentions ?? [], refs: m.refs ?? [],
  };
  await broadcast(env, { type: "message", data: msg });
  return msg;
}

/** Agent-authored post. Unprompted posts made during the day job are held unless urgent. */
export async function postAgentMessage(
  env: Env,
  p: { agent: AgentId; channelId: string; text: string; level?: Level | null; proposalId?: string | null;
       prompted: boolean; refs?: Message["refs"]; runId?: string | null },
): Promise<Message> {
  const schedule = await getSchedule(env);
  const held = !p.prompted && !p.channelId.startsWith("backroom:") && isHeldDuringWork(schedule, new Date(), p.level);
  return addMessage(env, {
    channelId: p.channelId, author: p.agent, text: p.text, level: p.level, proposalId: p.proposalId,
    refs: p.refs, held, runId: p.runId, mentions: parseMentions(p.text),
  });
}

const ALIASES: Record<string, AgentId> = { chief: "cos", chiefofstaff: "cos", cos: "cos", revenue: "revenue", rev: "revenue",
  support: "support", ship: "ship", scout: "scout" };

export function parseMentions(text: string): AgentId[] {
  const found = new Set<AgentId>();
  for (const m of text.matchAll(/@([a-z]+)/gi)) {
    const a = ALIASES[m[1]!.toLowerCase()];
    if (a && AgentIdSchema.safeParse(a).success) found.add(a);
  }
  return [...found];
}

export async function listMessages(env: Env, channelId: string, before: string | null, limit = 100): Promise<Message[]> {
  const q = before
    ? env.DB.prepare("SELECT * FROM messages WHERE channel_id = ? AND created_at < ? ORDER BY created_at DESC, rowid DESC LIMIT ?").bind(channelId, before, limit)
    : env.DB.prepare("SELECT * FROM messages WHERE channel_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?").bind(channelId, limit);
  const { results } = await q.all<MsgRow>();
  return results.map(toMessage).reverse();
}
