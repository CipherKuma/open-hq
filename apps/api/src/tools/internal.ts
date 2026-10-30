// Internal tools: the only way an agent changes anything. Called directly by the loop runtime and exposed over MCP.
// Agents never receive a tool that executes an external write; propose_action stores a proposal for the founder.
import { AgentId, Level, ProposalKind } from "@open-hq/shared";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { sendBackroom } from "../backroom";
import type { Env } from "../env";
import { MODELS, usdFor } from "../models";
import { cosine, embed } from "../runtime/nebius";
import type { Trigger } from "../runtime/types";
import { logActivity } from "../store/activity";
import { getChannel } from "../store/channels";
import { postAgentMessage } from "../store/messages";
import { createProposal, getProposal } from "../store/proposals";
import { clip, nowIso, parseJson, uid } from "../util";

export interface ToolCtx {
  env: Env;
  agent: AgentId;
  runId: string;
  trigger: Trigger;
  channelId: string | null;
}

interface ToolDef<S extends z.ZodTypeAny> {
  name: string;
  description: string;
  access: "read" | "propose";
  schema: S;
  run: (ctx: ToolCtx, args: z.infer<S>) => Promise<unknown>;
}

const def = <S extends z.ZodTypeAny>(d: ToolDef<S>): ToolDef<z.ZodTypeAny> => d as unknown as ToolDef<z.ZodTypeAny>;

const postMessage = def({
  name: "post_message",
  access: "propose",
  description: "Post a message to the founder in a channel you belong to (your DM `dm:<you>` or a group). Use level 'urgent' only for site down, checkout failing or a security issue.",
  schema: z.object({ channelId: z.string(), text: z.string().min(1).max(4000), level: Level.optional() }),
  async run(ctx, a) {
    const ch = await getChannel(ctx.env, a.channelId);
    if (!ch || !(ch.members as string[]).includes(ctx.agent)) return { error: "You are not a member of that channel" };
    const m = await postAgentMessage(ctx.env, {
      agent: ctx.agent, channelId: a.channelId, text: a.text, level: a.level ?? null,
      prompted: ctx.trigger === "chat", runId: ctx.runId,
    });
    return { ok: true, messageId: m.id, heldUntilFounderIsFree: m.heldDuringWork };
  },
});

const messageAgent = def({
  name: "message_agent",
  access: "propose",
  description: "Send a note to another agent in the back room. They reply in the same thread. Max 6 messages per thread, then the Chief of Staff takes over. Pass threadId to continue a thread.",
  schema: z.object({ to: AgentId, text: z.string().min(1).max(2000), threadId: z.string().optional() }),
  async run(ctx, a) {
    return sendBackroom(ctx.env, { from: ctx.agent, to: a.to, text: a.text, threadId: a.threadId, runId: ctx.runId });
  },
});

const proposeAction = def({
  name: "propose_action",
  access: "propose",
  description: "Propose an action for the founder to approve. The app executes it only after approval, exactly as proposed. Never claim you did the action; say you proposed it. payload is the exact action (e.g. {chargeId, amount} for stripe_refund).",
  schema: z.object({
    kind: ProposalKind,
    title: z.string().min(3).max(140),
    why: z.string().min(3).max(800),
    payload: z.record(z.unknown()),
    level: Level,
    productId: z.string().optional(),
    dependsOn: z.string().optional(),
  }),
  async run(ctx, a) {
    if (a.dependsOn && !(await getProposal(ctx.env, a.dependsOn))) return { error: `dependsOn ${a.dependsOn} does not exist` };
    const { proposal, created } = await createProposal(ctx.env, {
      agent: ctx.agent, kind: a.kind, title: a.title, why: a.why, payload: a.payload, level: a.level,
      productId: a.productId ?? null, dependsOn: a.dependsOn ?? null,
    });
    if (created) {
      const target = ctx.channelId && !ctx.channelId.startsWith("backroom:") && (await getChannel(ctx.env, ctx.channelId))
        ? ctx.channelId : `dm:${ctx.agent}`;
      await postAgentMessage(ctx.env, {
        agent: ctx.agent, channelId: target, text: `${a.title}\n\n${clip(a.why, 400)}`, level: a.level,
        proposalId: proposal.id, prompted: ctx.trigger === "chat", runId: ctx.runId,
      });
      await logActivity(ctx.env, { agent: ctx.agent, kind: "proposal", runtime: "app", summary: `Proposed: ${a.title}`, detail: `${a.kind} ${proposal.payloadHash.slice(0, 12)}`, runId: ctx.runId });
    }
    return { ok: true, proposalId: proposal.id, status: proposal.status, duplicateOfExisting: !created };
  },
});

const remember = def({
  name: "remember",
  access: "propose",
  description: "Save one durable fact to your own memory (a customer preference, a recurring pattern, a decision the founder made). Keep it to one sentence.",
  schema: z.object({ text: z.string().min(3).max(500) }),
  async run(ctx, a) {
    let vec: number[] | null = null;
    try {
      const e = await embed(ctx.env, [a.text]);
      vec = e.vectors[0] ?? null;
      await logActivity(ctx.env, { agent: ctx.agent, kind: "model_call", runtime: "loop", model: MODELS.embed, tokensIn: e.tokens, tokensOut: 0, usd: usdFor(MODELS.embed, e.tokens, 0), summary: "Embedded a memory", runId: ctx.runId });
    } catch {
      /* stored without a vector; recall embeds it lazily */
    }
    const id = uid("mem");
    await ctx.env.DB.prepare("INSERT INTO memories (id, agent, text, source, embedding_json, created_at) VALUES (?,?,?,?,?,?)")
      .bind(id, ctx.agent, a.text, `run ${ctx.runId}`, vec ? JSON.stringify(vec) : null, nowIso()).run();
    return { ok: true, id };
  },
});

const recall = def({
  name: "recall",
  access: "read",
  description: "Search your own memory by meaning. Returns the closest saved facts.",
  schema: z.object({ query: z.string().min(2).max(300), limit: z.number().int().min(1).max(8).optional() }),
  async run(ctx, a) {
    return { memories: await recallMemories(ctx.env, ctx.agent, a.query, a.limit ?? 4, ctx.runId) };
  },
});

export async function recallMemories(env: Env, agent: AgentId, query: string, limit: number, runId?: string): Promise<{ text: string; score: number }[]> {
  const { results } = await env.DB.prepare("SELECT id, text, embedding_json FROM memories WHERE agent = ? ORDER BY created_at DESC LIMIT 200")
    .bind(agent).all<{ id: string; text: string; embedding_json: string | null }>();
  if (!results.length) return [];
  const missing = results.filter((r) => !r.embedding_json);
  const inputs = [query, ...missing.map((m) => m.text)];
  const e = await embed(env, inputs);
  await logActivity(env, { agent, kind: "model_call", runtime: "loop", model: MODELS.embed, tokensIn: e.tokens, tokensOut: 0, usd: usdFor(MODELS.embed, e.tokens, 0), summary: "Embedded memory query", runId });
  const [q, ...fresh] = e.vectors;
  if (!q) return [];
  const vecs = new Map<string, number[]>();
  missing.forEach((m, i) => {
    if (fresh[i]) vecs.set(m.id, fresh[i]!);
  });
  if (vecs.size) {
    await env.DB.batch([...vecs].map(([id, v]) => env.DB.prepare("UPDATE memories SET embedding_json = ? WHERE id = ?").bind(JSON.stringify(v), id)));
  }
  return results
    .map((r) => ({ text: r.text, score: cosine(q, vecs.get(r.id) ?? parseJson<number[]>(r.embedding_json, [])) }))
    .sort((x, y) => y.score - x.score)
    .slice(0, limit)
    .map((r) => ({ text: r.text, score: Math.round(r.score * 1000) / 1000 }));
}

export const INTERNAL_TOOLS = [postMessage, messageAgent, proposeAction, remember, recall];
export const internalToolNames = new Set(INTERNAL_TOOLS.map((t) => t.name));

export function toOpenAITools(defs = INTERNAL_TOOLS) {
  return defs.map((t) => ({
    type: "function" as const,
    function: { name: t.name, description: t.description, parameters: zodToJsonSchema(t.schema, { target: "openApi3" }) as Record<string, unknown> },
  }));
}

export async function callInternalTool(ctx: ToolCtx, name: string, rawArgs: unknown): Promise<unknown> {
  const tool = INTERNAL_TOOLS.find((t) => t.name === name);
  if (!tool) return { error: `Unknown tool ${name}` };
  const parsed = tool.schema.safeParse(rawArgs);
  if (!parsed.success) return { error: `Invalid arguments: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}` };
  try {
    return await tool.run(ctx, parsed.data);
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
