import type { AgentId } from "@open-hq/shared";

export interface OpenAITool {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}
export interface NormalizedEvent {
  source: string; // "github" | "stripe" | "gmail" | "sentry" | ...
  type: string; // e.g. "github.push", "gmail.new_message"
  productId: string | null;
  agent: AgentId; // who should react
  summary: string;
  raw: unknown;
  at: string;
}
export interface ExecResult { ok: boolean; detail: string; url: string | null }
