// The connection catalog from the workplace design page ("Every connection, grouped by pipeline").
// base status: connected is decided live; "available" = one click with Composio managed OAuth,
// "needs_app" = needs our own OAuth app on Composio, "direct" = not on Composio, built by us.
import type { AgentId, Connection } from "@open-hq/shared";
import { READ_ALLOWLIST } from "./allowlists";

type Base = "available" | "needs_app" | "direct";
type Pipeline = Connection["pipeline"];
type Row = [slug: string, name: string, base: Base, agents: AgentId[]];

const BUILD: Row[] = [
  ["github", "GitHub", "available", ["ship", "scout"]],
  ["linear", "Linear", "available", ["ship"]],
  ["jira", "Jira", "available", ["ship"]],
  ["notion", "Notion", "available", ["cos", "ship"]],
];
const SHIP: Row[] = [
  ["vercel", "Vercel", "needs_app", ["ship"]],
  ["sentry", "Sentry", "available", ["ship"]],
  ["cloudflare", "Cloudflare", "needs_app", ["ship"]],
  ["supabase", "Supabase", "available", ["ship"]],
  ["render", "Render", "available", ["ship"]],
  ["railway", "Railway", "available", ["ship"]],
];
const MONEY: Row[] = [
  ["stripe", "Stripe", "available", ["revenue"]],
  ["lemon_squeezy", "Lemon Squeezy", "available", ["revenue"]],
  ["dodo_payments", "Dodo Payments", "direct", ["revenue"]],
  ["paddle", "Paddle", "direct", ["revenue"]],
];
const SUPPORT: Row[] = [
  ["gmail", "Gmail", "available", ["support"]],
  ["intercom", "Intercom", "available", ["support"]],
  ["crisp", "Crisp", "available", ["support"]],
  ["zendesk", "Zendesk", "available", ["support"]],
  ["discord", "Discord", "available", ["support", "scout"]],
];
const GROWTH: Row[] = [
  ["posthog", "PostHog", "needs_app", ["scout"]],
  ["mixpanel", "Mixpanel", "available", ["scout"]],
  ["google_analytics", "Google Analytics", "available", ["scout"]],
  ["google_search_console", "Search Console", "available", ["scout"]],
  ["plausible_analytics", "Plausible", "available", ["scout"]],
  ["apollo", "Apollo", "available", ["scout"]],
  ["hubspot", "HubSpot", "available", ["scout", "revenue"]],
  ["reddit", "Reddit", "available", ["scout"]],
  ["twitter", "X", "needs_app", ["scout"]],
  ["linkedin", "LinkedIn", "available", ["scout"]],
  ["youtube", "YouTube", "available", ["scout"]],
  ["product_hunt", "Product Hunt", "direct", ["scout"]],
];
const COMMS: Row[] = [
  ["googlecalendar", "Google Calendar", "available", ["cos"]],
  ["cal", "Cal.com", "available", ["cos"]],
  ["calendly", "Calendly", "available", ["cos"]],
  ["resend", "Resend", "available", ["cos", "support"]],
  ["loops_so", "Loops", "available", ["support", "scout"]],
  ["mailchimp", "Mailchimp", "available", ["scout"]],
  ["slack", "Slack", "available", ["cos"]],
  ["telegram", "Telegram", "available", ["cos"]],
  ["typeform", "Typeform", "available", ["support"]],
  ["tally", "Tally", "available", ["support"]],
];

export interface CatalogEntry {
  toolkit: string;
  name: string;
  pipeline: Pipeline;
  agents: AgentId[];
  base: Base;
}

const group = (pipeline: Pipeline, rows: Row[]): CatalogEntry[] =>
  rows.map(([toolkit, name, base, agents]) => ({ toolkit, name, pipeline, agents, base }));

export const CATALOG: CatalogEntry[] = [
  ...group("build", BUILD),
  ...group("ship", SHIP),
  ...group("money", MONEY),
  ...group("support", SUPPORT),
  ...group("growth", GROWTH),
  ...group("comms", COMMS),
];

export const catalogEntry = (toolkit: string) => CATALOG.find((c) => c.toolkit === toolkit.toLowerCase());

/** Read tool slugs the agents may use for a toolkit (empty for toolkits not wired tonight). */
export function readToolsForToolkit(toolkit: string): string[] {
  const set = new Set<string>();
  for (const a of Object.values(READ_ALLOWLIST)) for (const s of a.tools[toolkit] ?? []) set.add(s);
  return [...set];
}
