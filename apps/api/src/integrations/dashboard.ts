// dashboardData(productId): live numbers from the connected apps, degrading to clearly labelled samples.
// Pass-through: the caller caches. Every metric is independent; one failing source never fails the page.
import type { Dashboard } from "@open-hq/shared";
import { asEnv, demoRepo, type IntegrationsEnv } from "./env";
import { PRODUCTS, type DemoProduct } from "./products";
import { haveCloudflare, listDeployments } from "./rollback";
import { scopeQuery } from "./gmailscope";
import { listOf, sysRead } from "./system";
import { IntegrationError } from "./env";

type Pt = { t: string; v: number };
const DAY = 86_400;
const iso = (sec: number) => new Date(sec * 1000).toISOString();
const nowSec = () => Math.floor(Date.now() / 1000);

/** Deterministic wobbly series so the "sample" panels look stable between refreshes. */
export function sampleSeries(seed: string, base: number, days = 14, trend = 0.02): Pt[] {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const rnd = () => ((h = (h * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  return Array.from({ length: days }, (_, i) => ({
    t: iso(nowSec() - (days - 1 - i) * DAY),
    v: Math.max(0, Math.round(base * (1 + trend * i) * (0.8 + rnd() * 0.4))),
  }));
}

interface Sub { id: string; customer: string; status: string; created: number; canceled: number | null; cents: number; product: string | null }

function parseSubs(raw: any[]): Sub[] {
  return raw.map((s) => {
    const item = s.items?.data?.[0] ?? {};
    return {
      id: s.id,
      customer: typeof s.customer === "string" ? s.customer : s.customer?.id,
      status: s.status,
      created: s.created ?? 0,
      canceled: s.canceled_at ?? null,
      cents: (item.price?.unit_amount ?? item.plan?.amount ?? 0) * (item.quantity ?? 1),
      product: s.metadata?.openhq_product ?? item.price?.metadata?.openhq_product ?? null,
    };
  });
}

const mine = (p: DemoProduct) => (s: Sub) => (s.product ? s.product === p.id : s.cents === p.priceCents);
const live = (s: Sub) => ["active", "past_due", "trialing"].includes(s.status);

export async function stripeMetrics(env: IntegrationsEnv, p: DemoProduct) {
  const subs = parseSubs(listOf(await sysRead(env, "stripe", "STRIPE_LIST_SUBSCRIPTIONS", { status: "all", limit: 100 }))).filter(mine(p));
  const mrrAt = (t: number) => subs.filter((s) => s.created <= t && (!s.canceled || s.canceled > t) && (s.status !== "incomplete" && s.status !== "incomplete_expired")).reduce((a, s) => a + s.cents, 0) / 100;
  const now = nowSec();
  const liveSubs = subs.filter(live);
  const custIds = new Set(subs.map((s) => s.customer));
  let failed = 0;
  try {
    const charges = listOf(await sysRead(env, "stripe", "STRIPE_LIST_CHARGES", { limit: 100 }));
    failed = charges.filter((c) => c.status === "failed" && now - (c.created ?? now) < 30 * DAY && custIds.has(typeof c.customer === "string" ? c.customer : c.customer?.id)).length;
  } catch { /* charges unavailable: leave 0 */ }
  const series = Array.from({ length: 8 }, (_, i) => { const t = now - (7 - i) * 7 * DAY; return { t: iso(t), v: mrrAt(t) }; });
  const customers = new Set(liveSubs.map((s) => s.customer));
  return {
    mrr: { value: mrrAt(now), delta: mrrAt(now) - mrrAt(now - 30 * DAY), series },
    customers: { value: customers.size, delta: new Set(liveSubs.filter((s) => now - s.created < 30 * DAY).map((s) => s.customer)).size },
    failedPayments: failed + subs.filter((s) => s.status === "past_due").length,
  };
}

async function sentryOrg(env: IntegrationsEnv): Promise<string> {
  if (env.DEMO_SENTRY_ORG) return env.DEMO_SENTRY_ORG;
  const first = listOf(await sysRead(env, "sentry", "SENTRY_LIST_ORGANIZATIONS"))[0];
  if (!first?.slug) throw new IntegrationError("No Sentry organization found", "not_connected");
  return first.slug;
}

export async function sentryErrors(env: IntegrationsEnv): Promise<{ value: number; series: Pt[] }> {
  const org = await sentryOrg(env);
  const r = await sysRead(env, "sentry", "SENTRY_GET_ORGANIZATION_STATS_SUMMARY", { organization_id_or_slug: org, field: "sum(quantity)", category: "error", interval: "1d", statsPeriod: "14d" });
  const intervals: string[] = r?.intervals ?? [];
  const sums: number[] = (r?.groups ?? []).filter((g: any) => !g.by?.outcome || g.by.outcome === "accepted").reduce((acc: number[], g: any) => {
    (g.series?.["sum(quantity)"] ?? []).forEach((v: number, i: number) => { acc[i] = (acc[i] ?? 0) + v; });
    return acc;
  }, []);
  const series = intervals.map((t, i) => ({ t, v: sums[i] ?? 0 }));
  return { value: series.at(-1)?.v ?? 0, series };
}

export async function deploysFor(env: IntegrationsEnv): Promise<{ list: Dashboard["deploys"]; source: string }> {
  if (haveCloudflare(env)) {
    const deps = await listDeployments(env);
    const liveIdx = deps.findIndex((d) => d.live);
    const list = deps.slice(0, 6).map((d, i) => {
      // Anything newer than the live deployment was rolled back; a failed build is "failed".
      const state: "ok" | "failed" | "rolled_back" = !d.ok ? "failed" : liveIdx > 0 && i < liveIdx ? "rolled_back" : "ok";
      return { id: d.id, at: d.createdAt, state, ref: d.message.slice(0, 40) || d.id.slice(0, 8) };
    });
    return { list, source: "Cloudflare Pages deployments" };
  }
  const { owner, repo } = demoRepo(env);
  const commits = listOf(await sysRead(env, "github", "GITHUB_LIST_COMMITS", { owner, repo, per_page: 5 }));
  return { list: commits.map((c: any) => ({ id: c.sha, at: c.commit?.author?.date ?? "", state: "ok" as const, ref: String(c.sha).slice(0, 7) })), source: "GitHub commits (no deploy pipeline connected)" };
}

/** Open tickets = inbox threads in the Tidyform support scope. Never reads outside SUPPORT_QUERY. */
export async function ticketCount(env: IntegrationsEnv): Promise<number> {
  const r = await sysRead(env, "gmail", "GMAIL_LIST_THREADS", { user_id: "me", query: `${scopeQuery("in:inbox")}`, max_results: 100 });
  return listOf(r, ["threads", "items", "data"]).length;
}

export async function githubTraffic(env: IntegrationsEnv): Promise<{ value: number; delta: number; series: Pt[] }> {
  const { owner, repo } = demoRepo(env);
  const r = await sysRead(env, "github", "GITHUB_GET_PAGE_VIEWS", { owner, repo, per: "day" });
  const series: Pt[] = (r?.views ?? []).map((v: any) => ({ t: v.timestamp, v: v.count }));
  const sum = (a: Pt[]) => a.reduce((x, p) => x + p.v, 0);
  if (!sum(series)) throw new IntegrationError("No traffic recorded yet", "no_data");
  return { value: sum(series), delta: sum(series.slice(-7)) - sum(series.slice(0, -7).slice(-7)), series };
}

export async function dashboardData(productId: string, env: unknown): Promise<Dashboard> {
  const e = asEnv(env);
  const p = PRODUCTS[productId];
  if (!p) throw new IntegrationError(`Unknown product: ${productId}`, "unknown_product");
  const source: Record<string, string> = {};
  // Run one metric; on failure fall back to a labelled sample and record where each number came from.
  const metric = async <T,>(key: string, label: string, live: boolean, fn: () => Promise<T>, sample: () => T): Promise<T> => {
    if (live) {
      try { const v = await fn(); source[key] = label; return v; } catch { /* fall through to sample */ }
    }
    source[key] = "sample";
    return sample();
  };

  const [money, errors, deploys, tickets, traffic] = await Promise.all([
    (async () => {
      try {
        const m = await stripeMetrics(e, p);
        source.mrr = source.customers = source.failedPayments = "Stripe (sandbox) via Composio";
        return m;
      } catch {
        source.mrr = source.customers = source.failedPayments = "unavailable: Stripe not connected";
        return { mrr: { value: 0, delta: 0, series: [] as Pt[] }, customers: { value: 0, delta: 0 }, failedPayments: 0 };
      }
    })(),
    metric("errorRate", "Sentry via Composio (errors per day)", p.github, () => sentryErrors(e), () => { const series = sampleSeries(p.id + "err", 3); return { value: series[series.length - 1].v, series }; }),
    (async () => {
      try {
        if (!p.github) throw new Error("no repo");
        const d = await deploysFor(e);
        source.deploys = d.source;
        return d.list;
      } catch {
        source.deploys = "none recorded";
        return [] as Dashboard["deploys"];
      }
    })(),
    (async () => {
      try {
        if (!p.github) throw new Error("no inbox");
        const t = await ticketCount(e);
        source.openTickets = "Gmail, Tidyform support mail only (subject/label filter), via Composio";
        return t;
      } catch {
        source.openTickets = "sample";
        return p.github ? 4 : 3;
      }
    })(),
    metric("traffic", "GitHub repo traffic via Composio (page views, 14 days)", p.github, () => githubTraffic(e), () => ({ value: p.github ? 1280 : 940, delta: p.github ? 12 : 6, series: sampleSeries(p.id + "tr", p.github ? 90 : 65) })),
  ]);

  return {
    product: { id: p.id, name: p.name, url: p.url, tagline: p.tagline },
    mrr: money.mrr,
    customers: money.customers,
    failedPayments: money.failedPayments,
    deploys,
    errorRate: errors,
    openTickets: tickets,
    traffic,
    source,
  };
}
