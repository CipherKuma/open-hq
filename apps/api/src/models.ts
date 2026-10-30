// Exact model IDs from GET https://api.tokenfactory.nebius.com/v1/models (checked 2026-10-30).
// Super 120b and Nano 30B retire 9 Nov: never used here.
import type { AgentId } from "@open-hq/shared";

export const NEBIUS_BASE = "https://api.tokenfactory.nebius.com/v1";

export const MODELS = {
  ultra: "nvidia/Nemotron-3-Ultra-550b-a55b", // Chief of Staff
  superVl: "nvidia/Nemotron-3.5-Super-VL", // Revenue, Support, Ship, Scout
  lightning: "nvidia/Nemotron-3_5-Lightning", // triage + injection screen (thinking off)
  embed: "Qwen/Qwen3-Embedding-8B", // memory embeddings (dimensions=512 requested)
} as const;

export const EMBED_DIMENSIONS = 512;

// List prices in USD per million tokens (in, out).
export const PRICES: Record<string, { in: number; out: number }> = {
  [MODELS.ultra]: { in: 1.0, out: 3.0 },
  [MODELS.superVl]: { in: 0.3, out: 0.9 },
  [MODELS.lightning]: { in: 0.06, out: 0.24 },
  [MODELS.embed]: { in: 0.01, out: 0 },
};

export function modelFor(agent: AgentId): string {
  return agent === "cos" ? MODELS.ultra : MODELS.superVl;
}

export function usdFor(model: string, tokensIn: number, tokensOut: number): number {
  const p = PRICES[model] ?? { in: 0, out: 0 };
  return (tokensIn * p.in + tokensOut * p.out) / 1_000_000;
}
