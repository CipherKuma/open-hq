import { AGENTS, type AgentId } from "@open-hq/shared";

export const AGENT_ORDER: AgentId[] = ["cos", "revenue", "support", "ship", "scout"];
export const isAgent = (v: string): v is AgentId => (AGENT_ORDER as string[]).includes(v);
export const agentName = (id: string) => (isAgent(id) ? AGENTS[id].name : id === "you" ? "You" : id === "system" ? "Open HQ" : id);
export const agentShort = (id: string) => (isAgent(id) ? AGENTS[id].short : id === "you" ? "CK" : "HQ");

export const KIND_LABEL: Record<string, string> = {
  stripe_refund: "Stripe refund", email_reply: "Email reply", github_issue: "GitHub issue", github_revert: "GitHub revert",
  deploy_rollback: "Rollback", social_post: "Social post", standing_order: "Standing order", memory: "Memory",
};
export const LEVEL_LABEL = { urgent: "urgent", tonight: "tonight", week: "this week" } as const;
export const LEVEL_TONE = { urgent: "bad", tonight: "lamp", week: "info" } as const;
