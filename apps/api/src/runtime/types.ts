// Agent runtime contract. The api agent owns this file; runtime/hermes.ts and runtime/loop.ts implement it.
import type { AgentId } from "@open-hq/shared";

export type Trigger = "chat" | "shift" | "backroom" | "handover";

export interface RunInput {
  agent: AgentId;
  trigger: Trigger;
  channelId: string | null;
  prompt: string; // the new input: founder message, shift brief, back-room message, or handover brief
  history: { role: "user" | "assistant"; content: string }[]; // recent channel context, oldest first
  runId: string; // groups activity entries for this run
}

export interface RunResult {
  text: string; // final reply; empty when the agent acted only through tools
  model: string;
  tokensIn: number;
  tokensOut: number;
  runtime: "hermes" | "loop";
}

export interface AgentRuntime {
  run(input: RunInput, env: unknown): Promise<RunResult>;
}
