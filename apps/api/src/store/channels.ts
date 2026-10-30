import type { AgentId, Channel } from "@open-hq/shared";
import type { Env } from "../env";
import { nowIso, parseJson, uid } from "../util";

interface ChanRow { id: string; kind: Channel["kind"]; name: string; members_json: string; last_at: string | null; unread: number }

export const toChannel = (r: ChanRow): Channel => ({
  id: r.id, kind: r.kind, name: r.name, members: parseJson(r.members_json, []), unread: r.unread ?? 0, lastAt: r.last_at,
});

const SELECT = `SELECT c.*, (SELECT COUNT(*) FROM messages m WHERE m.channel_id = c.id AND m.author NOT IN ('you','system')
  AND m.created_at > COALESCE(c.last_read_at, '')) AS unread FROM channels c`;

export async function listChannels(env: Env): Promise<Channel[]> {
  const { results } = await env.DB.prepare(
    `${SELECT} ORDER BY CASE kind WHEN 'dm' THEN 0 WHEN 'group' THEN 1 ELSE 2 END, last_at DESC`,
  ).all<ChanRow>();
  return results.map(toChannel);
}

export async function getChannel(env: Env, id: string): Promise<Channel | null> {
  const r = await env.DB.prepare(`${SELECT} WHERE c.id = ?`).bind(id).first<ChanRow>();
  return r ? toChannel(r) : null;
}

export async function markRead(env: Env, id: string): Promise<void> {
  await env.DB.prepare("UPDATE channels SET last_read_at = ? WHERE id = ?").bind(nowIso(), id).run();
}

export async function createGroup(env: Env, name: string, agents: AgentId[]): Promise<Channel> {
  const id = `group:${uid("g").slice(2)}`;
  const members = ["you", ...new Set(agents)];
  await env.DB.prepare("INSERT INTO channels (id, kind, name, members_json, last_at, last_read_at, created_at) VALUES (?,?,?,?,?,?,?)")
    .bind(id, "group", name, JSON.stringify(members), null, nowIso(), nowIso()).run();
  return (await getChannel(env, id))!;
}

export async function ensureBackroom(env: Env, threadId: string, a: AgentId, b: AgentId, names: Record<string, string>): Promise<string> {
  const id = `backroom:${threadId}`;
  await env.DB.prepare("INSERT OR IGNORE INTO channels (id, kind, name, members_json, last_at, last_read_at, created_at) VALUES (?,?,?,?,?,?,?)")
    .bind(id, "backroom", `${names[a] ?? a} and ${names[b] ?? b}`, JSON.stringify([a, b]), null, nowIso(), nowIso()).run();
  return id;
}
