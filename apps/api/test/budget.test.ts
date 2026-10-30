import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Env } from "../src/env";
import { testEnv } from "./helpers";
import { BudgetError, overBudget } from "../src/budget";
import { runAgent } from "../src/runtime";
import type { AgentRuntime } from "../src/runtime/types";
import { logActivity } from "../src/store/activity";

let env: Env;
let dispose: () => Promise<void>;
beforeAll(async () => ({ env, dispose } = await testEnv()));
afterAll(() => dispose());

describe("daily budget", () => {
  it("overBudget is inclusive of the limit", () => {
    expect(overBudget(1.99, 2)).toBe(false);
    expect(overBudget(2, 2)).toBe(true);
  });
  it("stops a run before any model call once the agent has spent its budget", async () => {
    await logActivity(env, { agent: "scout", kind: "model_call", summary: "big spend", usd: 2.5, model: "nvidia/Nemotron-3.5-Super-VL" });
    const run = vi.fn();
    const rt: AgentRuntime = { run };
    await expect(
      runAgent(env, { agent: "scout", trigger: "chat", channelId: "dm:scout", prompt: "hi", history: [], runId: "run_budget" }, { hermes: rt, loop: rt }),
    ).rejects.toBeInstanceOf(BudgetError);
    expect(run).not.toHaveBeenCalled();
  });
  it("does not affect another agent's budget", async () => {
    const rt: AgentRuntime = { run: vi.fn(async () => ({ text: "ok", model: "m", tokensIn: 1, tokensOut: 1, runtime: "loop" as const })) };
    const r = await runAgent(env, { agent: "ship", trigger: "chat", channelId: "dm:ship", prompt: "hi", history: [], runId: "run_ok" }, { hermes: rt, loop: rt });
    expect(r.text).toBe("ok");
  });
});
