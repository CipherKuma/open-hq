// Runtime selector: Hermes when AGENT_RUNTIME=hermes (50 s timeout, then fall back to the loop), otherwise the loop.
// Also owns the per-run bookkeeping: agent_runs row, agent_status broadcasts, activity for Hermes runs, R2 run log.
import { broadcast } from "../live";
import type { Env } from "../env";
import { modelFor, usdFor } from "../models";
import { assertBudget } from "../budget";
import { logActivity } from "../store/activity";
import { clip, errMessage, nowIso } from "../util";
import { hermesRuntime } from "./hermes";
import { loopRuntime } from "./loop";
import type { AgentRuntime, RunInput, RunResult } from "./types";

export const HERMES_TIMEOUT_MS = 50_000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

export function chooseRuntime(env: Env, trigger: RunInput["trigger"]): "hermes" | "loop" {
  // The handover needs a tool-free JSON answer, which only the loop guarantees.
  return env.AGENT_RUNTIME === "hermes" && trigger !== "handover" ? "hermes" : "loop";
}

async function setStatus(env: Env, agent: RunInput["agent"], status: "idle" | "working" | "waiting"): Promise<void> {
  await env.DB.prepare("UPDATE agents SET status = ? WHERE id = ?").bind(status, agent).run();
  await broadcast(env, { type: "agent_status", data: { id: agent, status } });
}

export async function runAgent(env: Env, input: RunInput, runtimes: { hermes: AgentRuntime; loop: AgentRuntime } = { hermes: hermesRuntime, loop: loopRuntime }): Promise<RunResult> {
  await assertBudget(env, input.agent); // stops the run before any model call when the daily budget is spent
  await env.DB.prepare("INSERT INTO agent_runs (id, agent, trigger, channel_id, started_at, status) VALUES (?,?,?,?,?, 'running')")
    .bind(input.runId, input.agent, input.trigger, input.channelId, nowIso()).run();
  await setStatus(env, input.agent, "working");
  const started = Date.now();
  let result: RunResult | null = null;
  let error: string | null = null;
  try {
    if (chooseRuntime(env, input.trigger) === "hermes") {
      try {
        result = await withTimeout(runtimes.hermes.run(input, env), HERMES_TIMEOUT_MS);
        await logActivity(env, {
          agent: input.agent, kind: "model_call", runtime: "hermes", model: result.model, tokensIn: result.tokensIn,
          tokensOut: result.tokensOut, usd: usdFor(result.model || modelFor(input.agent), result.tokensIn, result.tokensOut),
          ms: Date.now() - started, runId: input.runId, summary: `${input.trigger} run served by Hermes`, detail: clip(result.text, 300),
        });
      } catch (e) {
        await logActivity(env, { agent: input.agent, kind: "job", runtime: "app", runId: input.runId,
          summary: "Hermes unavailable, falling back to the loop runtime", detail: clip(errMessage(e), 300) });
      }
    }
    if (!result) result = await runtimes.loop.run(input, env);
    return result;
  } catch (e) {
    error = errMessage(e);
    throw e;
  } finally {
    const pending = await env.DB.prepare("SELECT COUNT(*) AS n FROM proposals WHERE agent = ? AND status = 'pending'").bind(input.agent).first<{ n: number }>();
    await env.DB.batch([
      env.DB.prepare("UPDATE agent_runs SET finished_at = ?, runtime = ?, status = ? WHERE id = ?")
        .bind(nowIso(), result?.runtime ?? null, error ? "failed" : "done", input.runId),
      env.DB.prepare("UPDATE agents SET last_run_at = ?, last_runtime = COALESCE(?, last_runtime) WHERE id = ?")
        .bind(nowIso(), result?.runtime ?? null, input.agent),
    ]);
    await setStatus(env, input.agent, (pending?.n ?? 0) > 0 ? "waiting" : "idle");
    try {
      await env.RUNS.put(`runs/${input.runId}.json`, JSON.stringify({ input: { ...input, history: input.history.slice(-6) }, result, error, at: nowIso() }));
    } catch {
      /* run log is best effort */
    }
  }
}
