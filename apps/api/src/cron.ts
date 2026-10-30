// */10 * * * * dispatcher: decides which shifts are due from the founder schedule, once per firing key.
import type { Env } from "./env";
import { dispatchJob } from "./jobs";
import { pruneRateLimits } from "./ratelimit";
import { dueTasks } from "./schedule";
import { briefFor, cosBrief } from "./shifts";
import { getSchedule } from "./store/workspace";
import { nowIso } from "./util";

export async function runCron(env: Env, now = new Date()): Promise<string[]> {
  await pruneRateLimits(env);
  if (env.CRON_ENABLED === "0") return [];
  const schedule = await getSchedule(env);
  const fired: string[] = [];
  for (const due of dueTasks(schedule, now)) {
    const claim = await env.DB.prepare("INSERT OR IGNORE INTO cron_runs (key, at) VALUES (?, ?)").bind(due.key, nowIso()).run();
    if ((claim.meta.changes ?? 0) === 0) continue; // already fired for this tick
    fired.push(due.task);
    switch (due.task) {
      case "ship": case "revenue": case "support": case "scout":
        await dispatchJob(env, { kind: "shift", agent: due.task, brief: briefFor(due.task) });
        break;
      case "cos_midday": case "wrapup":
        await dispatchJob(env, { kind: "shift", agent: "cos", brief: await cosBrief(env, due.task) });
        break;
      case "handover":
        await dispatchJob(env, { kind: "handover" });
        break;
    }
  }
  return fired;
}
