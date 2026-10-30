// listConnections (catalog merged with live Composio status) and linkConnection (OAuth redirect URL).
import type { Connection } from "@open-hq/shared";
import { CATALOG, catalogEntry, readToolsForToolkit } from "./catalog";
import { cachedSession, createLink, listAccounts } from "./composio";
import { IntegrationError, asEnv, demoRepo, type IntegrationsEnv } from "./env";
import { lastRead } from "./read";
import { listOf, sysRead } from "./system";

const LIVE_TOOLKITS = ["github", "stripe", "gmail", "sentry"];
let identityCache: { at: number; value: Record<string, string | null> } | null = null;

const find = (o: any, keys: string[]): unknown => {
  for (const k of keys) {
    const v = o?.[k] ?? o?.details?.[k] ?? o?.data?.[k] ?? o?.response_data?.[k];
    if (v !== undefined && v !== null) return v;
  }
  return undefined;
};

/** Human-readable account label for a connected toolkit, resolved with a cheap read. Never throws. */
async function identity(env: IntegrationsEnv, toolkit: string): Promise<string | null> {
  try {
    if (toolkit === "gmail") return (find(await sysRead(env, "gmail", "GMAIL_GET_PROFILE", { user_id: "me" }), ["emailAddress"]) as string) ?? null;
    if (toolkit === "stripe") {
      const live = find(await sysRead(env, "stripe", "STRIPE_RETRIEVE_BALANCE"), ["livemode"]);
      return live === true ? "Stripe LIVE account" : live === false ? "Stripe sandbox" : "Stripe";
    }
    if (toolkit === "github") {
      const { owner, repo } = demoRepo(env);
      await sysRead(env, "github", "GITHUB_GET_A_REPOSITORY", { owner, repo });
      return `${owner}/${repo}`;
    }
    if (toolkit === "sentry") {
      const first = listOf(await sysRead(env, "sentry", "SENTRY_LIST_ORGANIZATIONS"))[0];
      return first?.slug ?? first?.name ?? null;
    }
  } catch {
    return null;
  }
  return null;
}

export async function listConnections(env: unknown): Promise<Connection[]> {
  const e = asEnv(env);
  const accounts = await listAccounts(e);
  const active = new Set(accounts.filter((a) => a.status === "ACTIVE").map((a) => a.toolkit));

  if (!identityCache || Date.now() - identityCache.at > 60_000) {
    const connected = LIVE_TOOLKITS.filter((t) => active.has(t));
    const labels = await Promise.all(connected.map((t) => identity(e, t)));
    identityCache = { at: Date.now(), value: Object.fromEntries(connected.map((t, i) => [t, labels[i]])) };
  }
  return CATALOG.map((c) => {
    const connected = active.has(c.toolkit);
    return {
      toolkit: c.toolkit,
      name: c.name,
      pipeline: c.pipeline,
      agents: c.agents,
      status: connected ? "connected" : c.base,
      account: connected ? identityCache!.value[c.toolkit] ?? null : null,
      readTools: readToolsForToolkit(c.toolkit),
      lastReadAt: lastRead.get(c.toolkit) ?? null,
    };
  });
}

export async function linkConnection(toolkit: string, env: unknown): Promise<{ redirectUrl: string }> {
  const e = asEnv(env);
  const slug = toolkit.toLowerCase();
  const entry = catalogEntry(slug);
  if (!entry) throw new IntegrationError(`Unknown toolkit: ${toolkit}`, "unknown_toolkit");
  if (entry.base === "direct") throw new IntegrationError(`${entry.name} is not on Composio; it uses a direct connection`, "direct");
  if (entry.base === "needs_app") throw new IntegrationError(`${entry.name} needs our own OAuth app registered on Composio before it can be connected`, "needs_app");
  const s = await cachedSession(e, `link:${slug}`, { toolkits: [slug], tools: {}, disableDestructive: false });
  const callback = `${e.PUBLIC_URL || "https://openhq.pages.dev"}/connections?connected=${encodeURIComponent(slug)}`;
  return { redirectUrl: await createLink(e, s.id, slug, callback) };
}
