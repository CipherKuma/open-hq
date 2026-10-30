import type { AgentId, Channel, Message } from "@open-hq/shared";
import { ApiRequestError, type Api } from "../types";
import { db, emit, subscribe } from "./state";
import { nowIso, sleep, uid } from "./clock";
import { agentReply, runWorkdayScript } from "./script";

const lag = (ms = 220) => sleep(ms + Math.random() * 180);
const out = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
const notFound = (what: string) => new ApiRequestError(`${what} not found`, "not_found", 404);

export const mockApi: Api = {
  mode: "mock",
  async workspace() { await lag(); return out(db.workspace); },
  async handover() { await lag(400); return out(db.handover); },
  async channels() { await lag(); return out(db.channels); },
  async messages(channelId) {
    await lag();
    const ch = db.channels.find((c) => c.id === channelId);
    if (!ch) throw notFound("Channel");
    ch.unread = 0;
    return out(db.messages.filter((m) => m.channelId === channelId).sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
  },
  async postMessage(channelId, text) {
    await lag(300);
    const ch = db.channels.find((c) => c.id === channelId);
    if (!ch) throw notFound("Channel");
    if (ch.kind === "backroom") throw new ApiRequestError("The back room is read-only. Message an agent directly instead.", "read_only", 403);
    const mentions = [...text.matchAll(/@(cos|revenue|support|ship|scout)\b/g)].map((x) => x[1] as AgentId);
    const msg: Message = { id: uid("msg"), channelId, author: "you", text, createdAt: nowIso(), heldDuringWork: false, level: null, proposalId: null, mentions, refs: [] };
    db.messages.push(msg);
    ch.lastAt = msg.createdAt;
    const members = ch.members.filter((x): x is AgentId => x !== "you");
    const responders = mentions.length ? mentions.filter((x) => members.includes(x)) : members.slice(0, 1);
    responders.forEach((agent, i) => void agentReply(channelId, agent, text, i * 1600));
    return out(msg);
  },
  async createGroup(name, agents) {
    await lag(350);
    const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "group";
    if (db.channels.some((c) => c.id === `group:${slug}`)) throw new ApiRequestError("A group with that name already exists", "conflict", 409);
    const ch: Channel = { id: `group:${slug}`, kind: "group", name: slug, members: ["you", ...agents], unread: 0, lastAt: nowIso() };
    db.channels.push(ch);
    return out(ch);
  },
  async proposals(status) { await lag(); return out(status ? db.proposals.filter((p) => p.status === status) : db.proposals); },
  async decide(id, body) {
    await lag(350);
    const p = db.proposals.find((x) => x.id === id);
    if (!p) throw notFound("Proposal");
    if (p.status !== "pending") throw new ApiRequestError("This decision was already made.", "not_pending", 409);
    if (body.payloadHash !== p.payloadHash) throw new ApiRequestError("The action changed since you saw it. Review it again.", "hash_mismatch", 409);
    const next = { ...p, status: body.decision === "approve" ? "executing" : "declined", decidedAt: nowIso() } as typeof p;
    emit({ type: "proposal", data: next });
    if (body.decision === "approve") {
      setTimeout(() => {
        const detail = p.kind === "stripe_refund" ? "Refund re_3Q9a… created for $29.00 (test mode)." : p.kind === "email_reply" ? "Sent from jedionchain@gmail.com." : p.kind === "github_issue" ? "Issue #57 opened on CipherKuma/tidyform." : p.kind === "social_post" ? "Scheduled for Wednesday 20:00." : "Done.";
        const url = p.kind === "github_issue" ? "https://github.com/CipherKuma/tidyform/issues" : p.kind === "stripe_refund" ? "https://dashboard.stripe.com/test/refunds" : null;
        emit({ type: "proposal", data: { ...next, status: "done", result: { ok: true, detail, url } } });
        emit({ type: "activity", data: { id: uid("act"), at: nowIso(), agent: "you", kind: "execution", summary: `Executed: ${p.title}`, model: null, tokensIn: null, tokensOut: null, usd: null, ms: 1800, runtime: "app", detail: `${p.kind} · payloadHash ${p.payloadHash.slice(0, 8)}…` } });
      }, 1800);
    }
    return out(next);
  },
  async dashboard(id) { await lag(450); const d = db.dashboards[id]; if (!d) throw notFound("Product"); return out(d); },
  async agent(id) { await lag(); const a = db.agents[id]; if (!a) throw notFound("Agent"); return out(a); },
  async schedule() { await lag(); return out(db.workspace.schedule); },
  async putSchedule(s) { await lag(400); db.workspace.schedule = out(s); return out(s); },
  async connections() { await lag(350); return out(db.connections); },
  async link(toolkit) {
    await lag(300);
    const c = db.connections.find((x) => x.toolkit === toolkit);
    if (!c) throw notFound("Connection");
    if (c.status === "direct") throw new ApiRequestError(`${c.name} isn't on Composio yet; Open HQ connects it directly after launch.`, "direct", 400);
    return { redirectUrl: `https://connect.composio.dev/link/ln_${toolkit}_demo` };
  },
  async activity(q) {
    await lag();
    const rows = q?.agent ? db.activity.filter((e) => e.agent === q.agent) : db.activity;
    return out(rows.slice(0, q?.limit ?? 200));
  },
  async runWorkday() { await lag(300); const runId = uid("run"); void runWorkdayScript(runId); return { runId }; },
  connectLive: (onEvent, onState) => subscribe(onEvent, onState),
};
