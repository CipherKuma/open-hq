// The write-only Composio session. Only execute() touches this; no agent can reach it.
import { WRITE_TOOLS } from "./allowlists";
import { runInSession, type SessionSpec } from "./composio";
import { IntegrationError, type IntegrationsEnv } from "./env";

const WRITE_SPEC: SessionSpec = { toolkits: Object.keys(WRITE_TOOLS), tools: WRITE_TOOLS, disableDestructive: false };

/** Composio wraps provider responses differently per toolkit; peel known envelopes. */
export function unwrap(d: any): any {
  let cur = d;
  for (let i = 0; i < 3; i++) {
    if (cur && typeof cur === "object" && !Array.isArray(cur)) {
      const keys = Object.keys(cur);
      const inner = cur.details ?? cur.response_data ?? (keys.length <= 2 ? cur.data : undefined);
      if (inner !== undefined && inner !== null && typeof inner === "object" && keys.length <= 3) { cur = inner; continue; }
    }
    break;
  }
  return cur;
}

export async function write(env: IntegrationsEnv, slug: string, args: Record<string, unknown>): Promise<any> {
  const allowed = Object.values(WRITE_TOOLS).flat();
  if (!allowed.includes(slug)) throw new IntegrationError(`Tool ${slug} is not in the write allowlist`, "tool_not_allowed");
  const out = await runInSession(env, "write", WRITE_SPEC, slug, args);
  if (!out.successful) throw new IntegrationError(out.error ?? `${slug} failed`, "tool_failed");
  return unwrap(out.data);
}
