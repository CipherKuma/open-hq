// Founder messages: store, broadcast, then dispatch the addressed agent(s). DM -> that agent; group -> @mentions,
// otherwise the most relevant member chosen by Lightning.
import { AGENTS, AgentId } from "@open-hq/shared";
import type { Message } from "@open-hq/shared";
import type { Env } from "./env";
import { dispatchJob } from "./jobs";
import { MODELS, usdFor } from "./models";
import { chat, extractJson } from "./runtime/nebius";
import { logActivity } from "./store/activity";
import { getChannel, markRead } from "./store/channels";
import { addMessage, parseMentions } from "./store/messages";
import { ApiErr } from "./util";

export async function pickGroupAgent(env: Env, members: AgentId[], text: string): Promise<AgentId> {
  const list = members.map((m) => `${m}: ${AGENTS[m].job}`).join("\n");
  try {
    const r = await chat(env, {
      model: MODELS.lightning, thinking: false, temperature: 0, maxTokens: 60,
      messages: [
        { role: "system", content: `Pick the single best agent to answer the founder's message.\n${list}\nAnswer JSON only: {"agent":"<id>"}` },
        { role: "user", content: text },
      ],
    });
    await logActivity(env, { agent: "system", kind: "model_call", runtime: "loop", model: MODELS.lightning, tokensIn: r.tokensIn, tokensOut: r.tokensOut, ms: r.ms, usd: usdFor(MODELS.lightning, r.tokensIn, r.tokensOut), summary: "Triage: chose an agent for a group message" });
    const parsed = AgentId.safeParse(extractJson<{ agent?: string }>(r.content)?.agent);
    if (parsed.success && members.includes(parsed.data)) return parsed.data;
  } catch {
    /* fall through to the first member */
  }
  return members.includes("cos") ? "cos" : members[0]!;
}

export async function handleFounderMessage(env: Env, channelId: string, text: string): Promise<Message> {
  const ch = await getChannel(env, channelId);
  if (!ch) throw new ApiErr(404, "Channel not found", "not_found");
  if (ch.kind === "backroom") throw new ApiErr(403, "The back room is read-only; message an agent in its DM or a group", "read_only");
  const agents = ch.members.filter((m): m is AgentId => m !== "you");
  const mentions = parseMentions(text).filter((m) => agents.includes(m));
  const msg = await addMessage(env, { channelId, author: "you", text, mentions });
  await markRead(env, channelId);
  const targets = ch.kind === "dm" ? agents.slice(0, 1) : mentions.length ? mentions : [await pickGroupAgent(env, agents, text)];
  for (const agent of targets) await dispatchJob(env, { kind: "chat", agent, channelId, text });
  return msg;
}
