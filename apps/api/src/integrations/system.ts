// Internal read-only calls (dashboard, identity). Separate sessions from the agents', same read-only guarantees.
import { SYSTEM_READS } from "./allowlists";
import { runInSession } from "./composio";
import { IntegrationError, type IntegrationsEnv } from "./env";
import { unwrap } from "./writes";

export async function sysRead(env: IntegrationsEnv, toolkit: string, slug: string, args: Record<string, unknown> = {}): Promise<any> {
  if (!(SYSTEM_READS[toolkit] ?? []).includes(slug)) throw new IntegrationError(`${slug} is not a system read`, "tool_not_allowed");
  const spec = { toolkits: [toolkit], tools: { [toolkit]: SYSTEM_READS[toolkit] }, disableDestructive: true };
  const out = await runInSession(env, `sys:${toolkit}`, spec, slug, args);
  if (!out.successful) throw new IntegrationError(out.error ?? `${slug} failed`, "tool_failed");
  return unwrap(out.data);
}

/** First array found under any of the keys (Composio nests list results differently per toolkit). */
export function listOf(d: any, keys: string[] = ["items", "data", "result", "results", "issues", "messages", "threads", "labels", "workflow_runs", "deployments", "commits"]): any[] {
  if (Array.isArray(d)) return d;
  for (const k of keys) {
    const v = d?.[k];
    if (Array.isArray(v)) return v;
    if (v && typeof v === "object") { const inner = listOf(v, keys); if (inner.length) return inner; }
  }
  return [];
}
