// Thin client for Nebius Token Factory (OpenAI-compatible). Handles Nemotron quirks:
// reasoning_content is separate from content, content is null when only tool calls are returned,
// and Lightning leaks its chain of thought into content unless thinking is switched off.
import { EMBED_DIMENSIONS, MODELS, NEBIUS_BASE } from "../models";
import type { Env } from "../env";

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}
export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}
export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  tools?: unknown[];
  maxTokens?: number;
  temperature?: number;
  thinking?: boolean; // false switches chain of thought off (Lightning triage/screen)
}
export interface ChatResult {
  content: string;
  toolCalls: ToolCall[];
  tokensIn: number;
  tokensOut: number;
  ms: number;
  finish: string;
}

export class NebiusError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const stripThinking = (s: string): string =>
  s.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/^[\s\S]*?<\/think>/i, "").trim();

async function post(env: Env, path: string, body: unknown, timeoutMs: number): Promise<unknown> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`${NEBIUS_BASE}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${env.NEBIUS_API_KEY}` },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.ok) return await res.json();
      const text = await res.text();
      lastErr = new NebiusError(res.status, `Token Factory ${res.status}: ${text.slice(0, 200)}`);
      if (res.status !== 429 && res.status < 500) break;
    } catch (e) {
      lastErr = e;
    }
    await new Promise((r) => setTimeout(r, 1200));
  }
  throw lastErr instanceof Error ? lastErr : new NebiusError(502, "Token Factory unreachable");
}

export async function chat(env: Env, req: ChatRequest): Promise<ChatResult> {
  const started = Date.now();
  const body: Record<string, unknown> = {
    model: req.model,
    messages: req.messages,
    max_tokens: req.maxTokens ?? 2500,
    temperature: req.temperature ?? 0.3,
  };
  if (req.tools && req.tools.length) {
    body.tools = req.tools;
    body.tool_choice = "auto";
  }
  if (req.thinking === false) body.chat_template_kwargs = { enable_thinking: false };
  const json = (await post(env, "/chat/completions", body, 85_000)) as {
    choices?: { finish_reason?: string; message?: { content?: string | null; tool_calls?: ToolCall[] | null } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const choice = json.choices?.[0];
  const msg = choice?.message;
  return {
    content: stripThinking(msg?.content ?? ""),
    toolCalls: msg?.tool_calls ?? [],
    tokensIn: json.usage?.prompt_tokens ?? 0,
    tokensOut: json.usage?.completion_tokens ?? 0,
    ms: Date.now() - started,
    finish: choice?.finish_reason ?? "unknown",
  };
}

export async function embed(env: Env, inputs: string[]): Promise<{ vectors: number[][]; tokens: number }> {
  const json = (await post(
    env,
    "/embeddings",
    { model: MODELS.embed, input: inputs, dimensions: EMBED_DIMENSIONS },
    30_000,
  )) as { data?: { embedding: number[] }[]; usage?: { total_tokens?: number } };
  return { vectors: (json.data ?? []).map((d) => d.embedding), tokens: json.usage?.total_tokens ?? 0 };
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

export function extractJson<T = unknown>(text: string): T | null {
  const cleaned = text.replace(/```(?:json)?/gi, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}
