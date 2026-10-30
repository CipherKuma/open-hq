// Cloudflare Workflows: AgentRunWorkflow runs one background job; WorkdayWorkflow runs a full workday on demand.
import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import type { Env } from "./env";
import { buildHandover } from "./handover";
import { executeJob, pendingJobCount, type TrackedJob } from "./jobs";
import { briefFor, runShift, SHIFT_AGENTS } from "./shifts";
import { logActivity } from "./store/activity";
import { clip, errMessage, nowIso } from "./util";

const NO_RETRY = { retries: { limit: 0, delay: "1 second" as const }, timeout: "10 minutes" as const };

export class AgentRunWorkflow extends WorkflowEntrypoint<Env, TrackedJob> {
  async run(event: WorkflowEvent<TrackedJob>, step: WorkflowStep): Promise<void> {
    await step.do("run", NO_RETRY, async () => {
      await executeJob(this.env, event.payload);
      return "done";
    });
  }
}

export class WorkdayWorkflow extends WorkflowEntrypoint<Env, { runId: string }> {
  async run(event: WorkflowEvent<{ runId: string }>, step: WorkflowStep): Promise<void> {
    const env = this.env;
    const startedAt = nowIso();
    await step.do("announce", async () => {
      await logActivity(env, { agent: "cos", kind: "job", runtime: "app", summary: "Workday started: Revenue, Support, Ship and Scout are running their shifts" });
      return "ok";
    });
    // Each agent reads its real sources; back-room messages they send run as their own jobs.
    await Promise.all(SHIFT_AGENTS.map((a) =>
      step.do(`shift:${a}`, NO_RETRY, async () => (await runShift(env, a, briefFor(a))).note)));
    for (let i = 0; i < 8; i++) {
      const pending = await step.do(`settle-check-${i}`, async () => pendingJobCount(env, startedAt));
      if (!pending) break;
      await step.sleep(`settle-wait-${i}`, "15 seconds");
    }
    await step.do("handover", NO_RETRY, async () => {
      try {
        const h = await buildHandover(env);
        return `${h.decisions.length} decisions, ${h.plannedMinutes} min planned`;
      } catch (e) {
        await logActivity(env, { agent: "cos", kind: "job", runtime: "app", summary: "Handover failed", detail: clip(errMessage(e), 300) });
        return "failed";
      }
    });
    await step.do("finish", async () => {
      await env.DB.prepare("UPDATE workday_runs SET status = 'done', finished_at = ? WHERE id = ?").bind(nowIso(), event.payload.runId).run();
      await logActivity(env, { agent: "cos", kind: "job", runtime: "app", summary: "Workday finished: handover is ready" });
      return "ok";
    });
  }
}
