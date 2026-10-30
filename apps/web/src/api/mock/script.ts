import type { AgentId, Message, Proposal } from "@open-hq/shared";
import { db, emit } from "./state";
import { nowIso, sleep, uid } from "./clock";
import { MODELS } from "./world";

const msg = (channelId: string, author: AgentId, text: string, x: Partial<Message> = {}): Message => ({
  id: uid("msg"), channelId, author, text, createdAt: nowIso(), heldDuringWork: false, level: null, proposalId: null, mentions: [], refs: [], ...x,
});
const status = (id: AgentId, s: "idle" | "working" | "waiting") => emit({ type: "agent_status", data: { id, status: s } });
const modelCall = (agent: AgentId, summary: string, tin: number, tout: number, ms: number) => emit({
  type: "activity",
  data: { id: uid("act"), at: nowIso(), agent, kind: "model_call", summary, model: MODELS[agent], tokensIn: tin, tokensOut: tout, usd: Math.round(((tin * 0.2 + tout * 0.6) / 1e6) * 10000) / 10000, ms, runtime: "hermes", detail: null },
});
const toolCall = (agent: AgentId, summary: string, detail: string) => emit({
  type: "activity",
  data: { id: uid("act"), at: nowIso(), agent, kind: "tool_call", summary, model: null, tokensIn: null, tokensOut: null, usd: null, ms: 400 + Math.round(Math.random() * 700), runtime: "hermes", detail },
});

const REPLIES: Record<AgentId, string> = {
  cos: "Got it. I'll fold that into tonight's list and move the CSV fix to Sunday if the evening runs short.",
  revenue: "Checked Stripe just now: no new failed charges since 17:20. MRR is still **$1,284** on Tidyform.",
  support: "Nothing new in the inbox in the last hour. Marta's reply is ready to go as soon as you approve the refund.",
  ship: "v1.9.1 has been live since 17:52 with zero checkout errors. PR #48 is still the only one waiting on you.",
  scout: "Formspark's page still says $19. I'll check Basin and Getform again at 06:00.",
};

export async function agentReply(channelId: string, agent: AgentId, text: string, delay: number) {
  await sleep(500 + delay);
  status(agent, "working");
  await sleep(700);
  modelCall(agent, `Chat reply in ${channelId}`, 2400 + text.length * 3, 140, 1900);
  await sleep(1500);
  emit({ type: "message", data: msg(channelId, agent, REPLIES[agent]) });
  status(agent, "idle");
}

// Scripted demo workday: each agent runs a shift, then the Chief of Staff rewrites the handover.
export async function runWorkdayScript(runId: string) {
  const shifts: { agent: AgentId; tool: [string, string]; post: string; proposal?: Omit<Proposal, "id" | "createdAt"> }[] = [
    { agent: "ship", tool: ["GITHUB_LIST_DEPLOYMENTS on CipherKuma/tidyform", "{ repo: \"CipherKuma/tidyform\" }"], post: "Shift done: v1.9.1 healthy for 2 h, error rate 0.4%. No new PRs." },
    { agent: "revenue", tool: ["STRIPE_LIST_CHARGES since 17:20", "{ created: { gte: \"17:20\" } }"], post: "Shift done: one new Tidyform customer (Saltmarsh Ceramics, $12). MRR now **$1,296**." },
    {
      agent: "support", tool: ["GMAIL_FETCH_EMAILS unread", "{ query: \"is:unread\" }"],
      post: "Shift done: Bas from Wavehouse asked for a custom thank-you URL. That's already supported; reply drafted.",
      proposal: { agent: "support", productId: "tidyform", kind: "email_reply", title: "Reply to Bas Verhoeven: custom thank-you redirect", why: "Already supported via the `_redirect` field; he couldn't find it in the docs.", payload: { to: "bas@wavehouse.nl", subject: "Re: Redirect after submit?", threadId: "18f3a1c2b9d04e77", body: "Hi Bas, add a hidden field named _redirect with your thank-you URL and Tidyform will send people there after submitting. Cipher" }, payloadHash: "7c9e1b3d5f7a9c0e2f4b6d8a1c3e5f7b9d0a2c4e6f8b1d3a5c7e9f0b2d4a6c8e", status: "pending", level: "tonight", decidedAt: null, result: null, dependsOn: null },
    },
    { agent: "scout", tool: ["web_fetch getform.io/pricing", "GET https://getform.io/pricing"], post: "Shift done: Getform unchanged at $16. Tidyform traffic today is 2,140 visits (+18% WoW)." },
  ];
  await sleep(400);
  for (const s of shifts) {
    status(s.agent, "working");
    await sleep(500);
    toolCall(s.agent, s.tool[0], s.tool[1]);
    await sleep(900);
    modelCall(s.agent, `Shift (${runId})`, 5200, 420, 2600);
    await sleep(700);
    let proposalId: string | null = null;
    if (s.proposal) {
      const p: Proposal = { ...s.proposal, id: uid("prop"), createdAt: nowIso() };
      proposalId = p.id;
      emit({ type: "proposal", data: p });
    }
    emit({ type: "message", data: msg(`dm:${s.agent}`, s.agent, s.post, { proposalId, level: proposalId ? "tonight" : null }) });
    const ch = db.channels.find((c) => c.id === `dm:${s.agent}`);
    if (ch) ch.unread += 1;
    status(s.agent, "idle");
  }
  status("cos", "working");
  await sleep(600);
  toolCall("cos", "read_agent_output for 4 agents", "openhq.read_agent_output({ since: \"09:00\" })");
  await sleep(1400);
  modelCall("cos", "Rewrote tonight's handover", 19800, 1340, 9100);
  const pending = db.proposals.filter((p) => p.status === "pending");
  const h = { ...db.handover, decisions: pending, generatedAt: nowIso() };
  h.since = [...h.since.slice(0, 3), { agent: "revenue" as const, text: "One more Tidyform customer in the last hour (Saltmarsh Ceramics). MRR $1,296." }];
  emit({ type: "handover", data: h });
  emit({ type: "message", data: msg("dm:cos", "cos", `Handover refreshed: **${pending.length} decisions** waiting, tonight's list still fits in 3 h 10.`, { level: "tonight" }) });
  status("cos", "idle");
}
