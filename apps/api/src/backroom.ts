// Back room: agent-to-agent threads. Capped at 6 messages, then escalated to the Chief of Staff.
import { AGENTS } from "@open-hq/shared";
import type { AgentId } from "@open-hq/shared";
import type { Env } from "./env";
import { dispatchJob } from "./jobs";
import { addMessage } from "./store/messages";
import { ensureBackroom } from "./store/channels";
import { logActivity } from "./store/activity";
import { clip, uid } from "./util";

export const BACKROOM_CAP = 6;

export type ThreadVerdict = "open" | "full";
/** A thread accepts new messages while it holds fewer than BACKROOM_CAP of them. */
export const threadVerdict = (messageCount: number): ThreadVerdict => (messageCount >= BACKROOM_CAP ? "full" : "open");

const names = Object.fromEntries(Object.entries(AGENTS).map(([k, v]) => [k, v.name]));

async function countMessages(env: Env, channelId: string): Promise<number> {
  const r = await env.DB.prepare("SELECT COUNT(*) AS n FROM messages WHERE channel_id = ? AND author != 'system'")
    .bind(channelId).first<{ n: number }>();
  return r?.n ?? 0;
}

export interface BackroomResult { delivered: boolean; threadId: string; channelId: string; escalated: boolean; note: string }

export async function sendBackroom(
  env: Env, a: { from: AgentId; to: AgentId; text: string; threadId?: string; runId?: string },
): Promise<BackroomResult> {
  if (a.from === a.to) throw new Error("An agent cannot message itself");
  const threadId = a.threadId?.replace(/^backroom:/, "") || uid("t").slice(2);
  const channelId = await ensureBackroom(env, threadId, a.from, a.to, names);
  const count = await countMessages(env, channelId);
  if (threadVerdict(count) === "full") {
    await escalate(env, channelId);
    return { delivered: false, threadId, channelId, escalated: true, note: "Thread is full (6 messages); the Chief of Staff has been asked to take over." };
  }
  await addMessage(env, { channelId, author: a.from, text: a.text, mentions: [a.to], runId: a.runId });
  await logActivity(env, { agent: a.from, kind: "message", runtime: "app", summary: `Back room: ${names[a.from]} to ${names[a.to]}`, detail: clip(a.text, 300) });
  await dispatchJob(env, { kind: "backroom", agent: a.to, channelId, from: a.from, text: a.text });
  if (count + 1 >= BACKROOM_CAP) await escalate(env, channelId);
  return { delivered: true, threadId, channelId, escalated: false, note: `Delivered. ${names[a.to]} will reply in the thread.` };
}

/** Called after a reply lands: posts the reply if the thread has room, escalates when it fills. */
export async function postBackroomReply(env: Env, channelId: string, agent: AgentId, text: string, runId?: string): Promise<boolean> {
  const count = await countMessages(env, channelId);
  if (threadVerdict(count) === "full") {
    await escalate(env, channelId);
    return false;
  }
  await addMessage(env, { channelId, author: agent, text, runId });
  if (count + 1 >= BACKROOM_CAP) await escalate(env, channelId);
  return true;
}

export async function escalate(env: Env, channelId: string): Promise<void> {
  const already = await env.DB.prepare("SELECT 1 AS x FROM messages WHERE channel_id = ? AND author = 'system' AND text LIKE 'Thread reached%'")
    .bind(channelId).first();
  if (already) return;
  await addMessage(env, { channelId, author: "system", text: `Thread reached ${BACKROOM_CAP} messages. Escalated to Chief of Staff.` });
  const { results } = await env.DB.prepare("SELECT author, text FROM messages WHERE channel_id = ? AND author != 'system' ORDER BY created_at, rowid")
    .bind(channelId).all<{ author: string; text: string }>();
  const transcript = results.map((m) => `${names[m.author] ?? m.author}: ${m.text}`).join("\n");
  await dispatchJob(env, {
    kind: "backroom", agent: "cos", channelId, from: "system", escalation: true,
    text: `A back-room thread between two agents hit the ${BACKROOM_CAP}-message cap without settling. Transcript:\n${transcript}\n\nDecide what the founder needs to know. If a decision is needed, call propose_action; otherwise post one short summary to dm:cos with post_message.`,
  });
}
