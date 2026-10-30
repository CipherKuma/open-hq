import type { AgentId } from "@open-hq/shared";
import type { Env } from "./env";
import { getAgentRow, spendToday } from "./store/workspace";

export class BudgetError extends Error {
  constructor(public agent: AgentId, public spent: number, public budget: number) {
    super(`${agent} reached its daily budget ($${spent.toFixed(3)} of $${budget.toFixed(2)})`);
  }
}

export const overBudget = (spent: number, budget: number): boolean => spent >= budget;

/** Throws BudgetError when the agent has spent its daily USD budget; called before every model call. */
export async function assertBudget(env: Env, agent: AgentId): Promise<void> {
  const row = await getAgentRow(env, agent);
  const budget = row?.budget_usd ?? 1;
  const { usd } = await spendToday(env, agent);
  if (overBudget(usd, budget)) throw new BudgetError(agent, usd, budget);
}
