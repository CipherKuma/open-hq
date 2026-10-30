// Background jobs. Each runs inside an AgentRunWorkflow instance (own wall-clock budget); falls back to inline.
import { AGENTS } from "@open-hq/shared";
import type { AgentId } from "@open-hq/shared";
import { postBackroomReply } from "./backroom";
import { BudgetError } from "./budget";
import type { Env } from "./env";
import { buildHandover } from "./handover";
import { executeProposal } from "./proposals";
import { runAgent } from "./runtime";
import { wrapUntrusted } from "./screen";
import { runShift } from "./shifts";
import { logActivity } from "./store/activity";
import { addMessage, postAgentMessage, listMessages } from "./store/messages";
import { clip, errMessage, nowIso, uid } from "./util";

export type Job =
  | { kind: "chat"; agent: AgentId; channelId: string; text: string }
  | { kind: "backroom"; agent: AgentId; channelId: string; from: AgentId | "system"; text: string; escalation?: boolean }
  | { kind: "shift"; agent: AgentId; brief: string }
  | { kind: "event"; agent: AgentId; source: string; summary: string; text: string }
  | { kind: "handover" }
  | { kind: "execute"; proposalId: string };
export type TrackedJob = Job & { jobId: string };

export async function dispatchJob(env: Env, job: Job): Promise<string> {
  const jobId = uid("job");
  await env.DB.prepare("INSERT INTO jobs (id, kind, agent, status, created_at) VALUES (?,?,?,?,?)")
    .bind(jobId, job.kind, "agent" in job ? job.agent : null, "queued", nowIso()).run();
  const tracked: TrackedJob = { ...job, jobId };
  if (env.AGENT_RUN) {
    try {
      await env.AGENT_RUN.create({ id: jobId, params: tracked });
      return jobId;
    } catch (e) {
      await logActivity(env, { agent: "system", kind: "job", runtime: "app", summary: "Workflow dispatch failed, running inline", detail: clip(errMessage(e), 200) });
    }
  }
  await executeJob(env, tracked);
  return jobId;
}

export async function pendingJobCount(env: Env, sinceIso: string): Promise<number> {
  const r = await env.DB.prepare("SELECT COUNT(*) AS n FROM jobs WHERE status IN ('queued','running') AND created_at > ?").bind(sinceIso).first<{ n: number }>();
  return r?.n ?? 0;
}

export async function executeJob(env: Env, job: TrackedJob): Promise<void> {
  await env.DB.prepare("UPDATE jobs SET status = 'running' WHERE id = ?").bind(job.jobId).run();
  let error: string | null = null;
  try {
    await route(env, job);
  } catch (e) {
    error = errMessage(e);
  }
  await env.DB.prepare("UPDATE jobs SET status = ?, finished_at = ?, error = ? WHERE id = ?")
    .bind(error ? "failed" : "done", nowIso(), error?.slice(0, 300) ?? null, job.jobId).run();
}

async function route(env: Env, job: TrackedJob): Promise<void> {
  switch (job.kind) {
    case "chat": return chatJob(env, job);
    case "backroom": return backroomJob(env, job);
    case "shift": await runShift(env, job.agent, job.brief); return;
    case "event":
      await runShift(env, job.agent, `Event from ${job.source}: ${job.summary}\n\nReact to it with your read tools. Post to the founder only if it matters, and propose actions for anything that needs one.\n\n${wrapUntrusted(job.source, job.text)}`);
      return;
    case "handover": await buildHandover(env); return;
    case "execute": return executeProposal(env, job.proposalId);
  }
}

async function history(env: Env, channelId: string, agent: AgentId, skipLast: boolean) {
  const msgs = await listMessages(env, channelId, null, 14);
  const trimmed = skipLast ? msgs.slice(0, -1) : msgs;
  return trimmed.filter((m) => m.author !== "system").map((m) => {
    if (m.author === agent) return { role: "assistant" as const, content: m.text };
    const who = m.author === "you" ? "Founder" : AGENTS[m.author as AgentId]?.name ?? m.author;
    return { role: "user" as const, content: m.author === "you" ? m.text : `[${who}] ${m.text}` };
  });
}

async function failNote(env: Env, channelId: string, agent: AgentId, e: unknown): Promise<void> {
  const text = e instanceof BudgetError
    ? `${AGENTS[agent].name} has used today's budget ($${e.budget.toFixed(2)}) and is paused until tomorrow.`
    : `${AGENTS[agent].name} could not answer just now. Try again in a moment.`;
  await logActivity(env, { agent, kind: "job", runtime: "app", summary: `${AGENTS[agent].name} run failed`, detail: clip(errMessage(e), 300) });
  await addMessage(env, { channelId, author: "system", text });
}

/** The agent may already have answered through post_message (Hermes is told to); do not post the same answer twice. */
async function alreadyPosted(env: Env, channelId: string, runId: string): Promise<boolean> {
  const r = await env.DB.prepare("SELECT 1 AS x FROM messages WHERE channel_id = ? AND run_id = ? AND proposal_id IS NULL LIMIT 1").bind(channelId, runId).first();
  return !!r;
}

async function chatJob(env: Env, job: Extract<Job, { kind: "chat" }>): Promise<void> {
  const runId = uid("run");
  try {
    const r = await runAgent(env, {
      agent: job.agent, trigger: "chat", channelId: job.channelId, prompt: job.text, runId,
      history: await history(env, job.channelId, job.agent, true),
    });
    if (r.text.trim() && !(await alreadyPosted(env, job.channelId, runId))) {
      await postAgentMessage(env, { agent: job.agent, channelId: job.channelId, text: r.text.trim(), prompted: true, runId });
    }
  } catch (e) {
    await failNote(env, job.channelId, job.agent, e);
  }
}

async function backroomJob(env: Env, job: Extract<Job, { kind: "backroom" }>): Promise<void> {
  const runId = uid("run");
  const fromName = job.from === "system" ? "The system" : AGENTS[job.from].name;
  try {
    const r = await runAgent(env, {
      agent: job.agent, trigger: "backroom", channelId: job.channelId, runId,
      prompt: job.escalation ? job.text : `${fromName} wrote to you in the back room:\n${job.text}`,
      history: await history(env, job.channelId, job.agent, true),
    });
    const text = r.text.trim();
    if (!text) return;
    if (job.escalation) await addMessage(env, { channelId: job.channelId, author: job.agent, text, runId });
    else await postBackroomReply(env, job.channelId, job.agent, text, runId);
  } catch (e) {
    await logActivity(env, { agent: job.agent, kind: "job", runtime: "app", summary: `${AGENTS[job.agent].name} could not reply in the back room`, detail: clip(errMessage(e), 300) });
  }
}
