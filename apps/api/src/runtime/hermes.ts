// Hermes runtime: one POST per run to the Hermes Agent API server of the agent's profile.
// HERMES_URL is the gateway origin (see hermes/README.md). One Hermes gateway multiplexes the five profiles
// and routes by path prefix, authenticating each profile with its own API_SERVER_KEY (the shared HERMES_KEY):
//   POST {HERMES_URL}/p/{profile}/v1/chat/completions   (Authorization: Bearer HERMES_KEY)
// Hermes runs the tool loop itself (Open HQ MCP + read-only Composio MCP), so the reply is the final text.
// Any failure (not configured, timeout, non-2xx, malformed body) throws; the caller falls back to the loop runtime.
import { z } from "zod";
import type { AgentId } from "@open-hq/shared";
import { modelFor } from "../models";
import { clip, errMessage } from "../util";
import type { AgentRuntime, RunInput, RunResult } from "./types";

export const HERMES_TIMEOUT_MS = 50_000;

interface HermesEnv {
  HERMES_URL?: string;
  HERMES_KEY?: string;
}

// Agent id -> Hermes profile name (profiles are named exactly like the agent ids).
export const HERMES_ROUTES: Record<AgentId, string> = {
  cos: "cos",
  revenue: "revenue",
  support: "support",
  ship: "ship",
  scout: "scout",
};

const Completion = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({ content: z.string().nullable().optional() }),
        finish_reason: z.string().nullable().optional(),
      }),
    )
    .min(1),
  usage: z
    .object({ prompt_tokens: z.number().optional(), completion_tokens: z.number().optional() })
    .optional(),
});

export class HermesError extends Error {
  constructor(message: string, public status: number | null = null) {
    super(message);
    this.name = "HermesError";
  }
}

export function hermesEndpoint(agent: AgentId, env: HermesEnv): { url: string; key: string } {
  const base = env.HERMES_URL?.trim().replace(/\/+$/, "");
  const key = env.HERMES_KEY?.trim();
  if (!base || !key) throw new HermesError("hermes not configured: HERMES_URL and HERMES_KEY are required");
  return { url: `${base}/p/${HERMES_ROUTES[agent]}/v1/chat/completions`, key };
}

// Run context the agent needs to use the Open HQ MCP tools correctly (which channel to post in, which run).
function contextLine(input: RunInput): string {
  const channel = input.channelId ?? "none";
  return `Open HQ run context: trigger=${input.trigger}; channel=${channel}; run=${input.runId}. Post results to this channel with the Open HQ tools; propose actions, never perform them.`;
}

export function buildMessages(input: RunInput): { role: "system" | "user" | "assistant"; content: string }[] {
  return [
    { role: "system", content: contextLine(input) },
    ...input.history.map((h) => ({ role: h.role, content: h.content })),
    { role: "user", content: input.prompt },
  ];
}

export const hermesRuntime: AgentRuntime = {
  async run(input: RunInput, rawEnv: unknown): Promise<RunResult> {
    const env = (rawEnv ?? {}) as HermesEnv;
    const { url, key } = hermesEndpoint(input.agent, env);
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          authorization: `Bearer ${key}`,
          "content-type": "application/json",
          "idempotency-key": input.runId, // a retried run id never executes tool side effects twice
        },
        body: JSON.stringify({ model: "hermes-agent", stream: false, messages: buildMessages(input) }),
        signal: AbortSignal.timeout(HERMES_TIMEOUT_MS),
      });
    } catch (e) {
      const timedOut = e instanceof DOMException && (e.name === "TimeoutError" || e.name === "AbortError");
      throw new HermesError(timedOut ? `hermes timed out after ${HERMES_TIMEOUT_MS} ms` : `hermes unreachable: ${errMessage(e)}`);
    }
    if (!res.ok) throw new HermesError(`hermes ${res.status}: ${clip(await res.text().catch(() => ""), 200)}`, res.status);

    const parsed = Completion.safeParse(await res.json().catch(() => null));
    if (!parsed.success) throw new HermesError("hermes returned a malformed completion");
    const choice = parsed.data.choices[0]!;
    if (choice.finish_reason === "error" || choice.finish_reason === "cancelled") {
      throw new HermesError(`hermes run ended with ${choice.finish_reason}`);
    }
    return {
      text: (choice.message.content ?? "").trim(),
      model: modelFor(input.agent), // the Token Factory model the profile is pinned to
      tokensIn: parsed.data.usage?.prompt_tokens ?? 0,
      tokensOut: parsed.data.usage?.completion_tokens ?? 0,
      runtime: "hermes",
    };
  },
};
