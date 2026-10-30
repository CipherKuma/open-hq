import { Schedule } from "@open-hq/shared";
import type { AgentId, Product } from "@open-hq/shared";
import type { Env } from "../env";
import { parseJson } from "../util";
import { dayStartIso } from "../schedule";

export async function getSchedule(env: Env): Promise<Schedule> {
  const row = await env.DB.prepare("SELECT schedule_json FROM workspace LIMIT 1").first<{ schedule_json: string }>();
  const parsed = Schedule.safeParse(parseJson(row?.schedule_json, null));
  if (parsed.success) return parsed.data;
  return {
    timezone: "Asia/Kuala_Lumpur", dayJob: [], founderHours: [], handoverLeadMinutes: 15,
    urgentRules: ["site_down", "checkout_failing", "security"], channel: "app",
  };
}

export async function getProducts(env: Env): Promise<Product[]> {
  const { results } = await env.DB.prepare("SELECT id, name, url, tagline FROM products ORDER BY sort").all<Product>();
  return results;
}

export interface AgentRow {
  id: AgentId; name: string; job: string; soul: string; status: "idle" | "working" | "waiting";
  last_run_at: string | null; last_runtime: "hermes" | "loop"; budget_usd: number;
}

export async function getAgentRow(env: Env, id: string): Promise<AgentRow | null> {
  return env.DB.prepare("SELECT * FROM agents WHERE id = ?").bind(id).first<AgentRow>();
}

export async function spendToday(env: Env, agent: AgentId, now = new Date()): Promise<{ usd: number; tokens: number }> {
  const { timezone } = await getSchedule(env);
  const row = await env.DB.prepare(
    "SELECT COALESCE(SUM(usd),0) AS usd, COALESCE(SUM(COALESCE(tokens_in,0)+COALESCE(tokens_out,0)),0) AS tokens FROM activity WHERE agent = ? AND at >= ?",
  ).bind(agent, dayStartIso(timezone, now)).first<{ usd: number; tokens: number }>();
  return { usd: row?.usd ?? 0, tokens: row?.tokens ?? 0 };
}
