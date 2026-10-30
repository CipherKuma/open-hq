import { AGENTS } from "@open-hq/shared";
import type { AgentId, AgentProfile } from "@open-hq/shared";
import type { Env } from "../env";
import { readToolsFor } from "../integrations";
import { fmtHhmm, hhmm } from "../schedule";
import { INTERNAL_TOOLS } from "../tools/internal";
import { modelFor } from "../models";
import { getAgentRow, getSchedule, spendToday } from "./workspace";

const FIXED: Record<AgentId, { cron: string; task: string }[]> = {
  ship: [{ cron: "*/10 * * * *", task: "Watch deploys, errors and pull requests" }],
  revenue: [{ cron: "0 * * * *", task: "Hourly money check (customers, failed payments, MRR)" }],
  support: [{ cron: "30 * * * *", task: "Inbox sweep and triage" }],
  scout: [{ cron: "0 6 * * *", task: "Morning growth and competitor scan" }],
  cos: [{ cron: "30 12 * * *", task: "Midday check against tonight's plan" }, { cron: "0 23 * * *", task: "Wrap-up: what carries to tomorrow" }],
};

export async function agentProfile(env: Env, id: AgentId): Promise<AgentProfile | null> {
  const row = await getAgentRow(env, id);
  if (!row) return null;
  const [schedule, mem, so, spend] = await Promise.all([
    getSchedule(env),
    env.DB.prepare("SELECT id, text, source, created_at FROM memories WHERE agent = ? ORDER BY created_at DESC LIMIT 30").bind(id).all<{ id: string; text: string; source: string; created_at: string }>(),
    env.DB.prepare("SELECT id, text FROM standing_orders WHERE agent = ? ORDER BY created_at").bind(id).all<{ id: string; text: string }>(),
    spendToday(env, id),
  ]);
  const external = await readToolsFor(id, env).catch(() => []);
  const sched = [...FIXED[id]];
  if (id === "cos") {
    for (const b of schedule.founderHours) {
      const at = hhmm(b.start) - schedule.handoverLeadMinutes;
      sched.push({ cron: `${at % 60} ${Math.floor(at / 60)} * * ${b.days.join(",")}`, task: `Evening handover (${schedule.handoverLeadMinutes} min before ${fmtHhmm(hhmm(b.start))})` });
    }
  }
  return {
    id, name: AGENTS[id].name, job: AGENTS[id].job, model: modelFor(id), runtime: row.last_runtime, soul: row.soul,
    memory: mem.results.map((m) => ({ id: m.id, text: m.text, source: m.source, createdAt: m.created_at })),
    standingOrders: so.results,
    tools: [
      ...external.map((t) => ({ name: t.function.name, toolkit: t.function.name.split("_")[0]!.toLowerCase(), access: "read" as const })),
      ...INTERNAL_TOOLS.map((t) => ({ name: t.name, toolkit: "openhq", access: t.access })),
    ],
    schedule: sched,
    spendToday: { usd: Math.round(spend.usd * 10000) / 10000, tokens: spend.tokens, budgetUsd: row.budget_usd },
    lastRunAt: row.last_run_at,
  };
}
