// Scopes every agent Gmail read to the Tidyform support mail (see SUPPORT_QUERY).
import { SUPPORT_QUERY } from "./allowlists";
import { runInSession } from "./composio";
import { IntegrationError, type IntegrationsEnv } from "./env";
import type { SessionSpec } from "./composio";

const QUERY_FIELD: Record<string, string> = { GMAIL_FETCH_EMAILS: "query", GMAIL_LIST_THREADS: "query", GMAIL_LIST_MESSAGES: "q" };
const BY_ID: Record<string, { arg: string; kind: "message" | "thread" }> = {
  GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID: { arg: "message_id", kind: "message" },
  GMAIL_FETCH_MESSAGE_BY_THREAD_ID: { arg: "thread_id", kind: "thread" },
};

export const isGmailTool = (name: string) => name.startsWith("GMAIL_");

/** AND the support query onto whatever the agent asked for; strip grouping so it cannot be widened with OR. */
export function scopeQuery(user: unknown): string {
  const extra = typeof user === "string" ? user.replace(/[(){}]/g, " ").replace(/\s+/g, " ").trim() : "";
  return extra ? `(${SUPPORT_QUERY}) (${extra})` : `(${SUPPORT_QUERY})`;
}

/** Returns the arguments to actually send for a Gmail read (query forced, mailbox pinned to "me"). */
export function scopeGmailArgs(name: string, args: unknown): Record<string, unknown> {
  const a: Record<string, unknown> = { ...((args as Record<string, unknown>) ?? {}), user_id: "me" };
  const field = QUERY_FIELD[name];
  if (field) a[field] = scopeQuery(a[field]);
  return a;
}

/** By-id reads are only allowed when the id appears in the scoped search results. */
export async function assertInScope(env: IntegrationsEnv, key: string, spec: SessionSpec, name: string, args: Record<string, unknown>): Promise<void> {
  const rule = BY_ID[name];
  if (!rule) return;
  const id = String(args[rule.arg] ?? "");
  if (!/^[0-9a-f]{8,32}$/i.test(id)) throw new IntegrationError("Invalid Gmail id", "bad_request");
  const list = rule.kind === "message" ? "GMAIL_LIST_MESSAGES" : "GMAIL_LIST_THREADS";
  const q = rule.kind === "message" ? { q: scopeQuery(""), max_results: 200 } : { query: scopeQuery(""), max_results: 200 };
  const out = await runInSession(env, key, spec, list, { user_id: "me", ...q });
  const ids = JSON.stringify(out.data ?? "");
  if (!out.successful || !ids.includes(`"${id}"`)) {
    throw new IntegrationError("That message is outside the Tidyform support mail", "out_of_scope");
  }
}
