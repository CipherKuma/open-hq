import type { ActivityEntry, AgentId, Connection } from "@open-hq/shared";
import { at } from "./clock";
import { MODELS } from "./world";

type C = Connection;
const c = (toolkit: string, name: string, pipeline: C["pipeline"], agents: AgentId[], status: C["status"] = "available", extra: Partial<C> = {}): C => ({
  toolkit, name, pipeline, agents, status, account: null, readTools: [], lastReadAt: null, ...extra,
});

export const connections: Connection[] = [
  c("github", "GitHub", "build", ["ship", "scout"], "connected", { account: "CipherKuma/tidyform", readTools: ["GITHUB_LIST_DEPLOYMENTS", "GITHUB_LIST_PULL_REQUESTS", "GITHUB_GET_REPO_TRAFFIC_VIEWS"], lastReadAt: at("18:40") }),
  c("linear", "Linear", "build", ["ship"]), c("jira", "Jira", "build", ["ship"]), c("notion", "Notion", "build", ["ship", "cos"]),
  c("sentry", "Sentry", "ship", ["ship"], "connected", { account: "cipherkuma / tidyform", readTools: ["SENTRY_LIST_ISSUES", "SENTRY_GET_ISSUE"], lastReadAt: at("18:40") }),
  c("vercel", "Vercel", "ship", ["ship"], "needs_app"), c("cloudflare", "Cloudflare", "ship", ["ship"], "needs_app"),
  c("supabase", "Supabase", "ship", ["ship"]), c("render", "Render", "ship", ["ship"]), c("railway", "Railway", "ship", ["ship"]),
  c("stripe", "Stripe", "money", ["revenue"], "connected", { account: "Tidyform + Quillbill (test mode)", readTools: ["STRIPE_LIST_CHARGES", "STRIPE_LIST_SUBSCRIPTIONS", "STRIPE_RETRIEVE_CUSTOMER"], lastReadAt: at("18:00") }),
  c("lemonsqueezy", "Lemon Squeezy", "money", ["revenue"]), c("dodo", "Dodo Payments", "money", ["revenue"], "direct"), c("paddle", "Paddle", "money", ["revenue"], "direct"),
  c("gmail", "Gmail", "support", ["support"], "connected", { account: "jedionchain@gmail.com", readTools: ["GMAIL_FETCH_EMAILS", "GMAIL_GET_THREAD"], lastReadAt: at("18:31") }),
  c("intercom", "Intercom", "support", ["support"]), c("crisp", "Crisp", "support", ["support"]), c("zendesk", "Zendesk", "support", ["support"]), c("discord", "Discord", "support", ["support"]),
  c("posthog", "PostHog", "growth", ["scout"], "needs_app"), c("mixpanel", "Mixpanel", "growth", ["scout"]), c("google_analytics", "Google Analytics", "growth", ["scout"]),
  c("google_search_console", "Search Console", "growth", ["scout"]), c("plausible", "Plausible", "growth", ["scout"]), c("reddit", "Reddit", "growth", ["scout"]),
  c("twitter", "X", "growth", ["scout"], "needs_app"), c("linkedin", "LinkedIn", "growth", ["scout"]), c("producthunt", "Product Hunt", "growth", ["scout"], "direct"),
  c("googlecalendar", "Google Calendar", "comms", ["cos"]), c("calcom", "Cal.com", "comms", ["cos"]), c("resend", "Resend", "comms", ["cos"]),
  c("slack", "Slack", "comms", ["cos"]), c("telegram", "Telegram", "comms", ["cos"]), c("typeform", "Typeform", "comms", ["cos"]),
];

let k = 0;
const a = (hhmm: string, agent: ActivityEntry["agent"], kind: ActivityEntry["kind"], summary: string, x: Partial<ActivityEntry> = {}): ActivityEntry => ({
  id: `act_${++k}`, at: at(hhmm), agent, kind, summary, model: null, tokensIn: null, tokensOut: null, usd: null, ms: null, runtime: null, detail: null, ...x,
});
const call = (agent: AgentId, tin: number, tout: number, ms: number, runtime: "hermes" | "loop" = "hermes") => ({
  model: MODELS[agent], tokensIn: tin, tokensOut: tout, ms, runtime,
  usd: Math.round(((tin * (agent === "cos" ? 0.6 : 0.2) + tout * (agent === "cos" ? 1.8 : 0.6)) / 1e6) * 10000) / 10000,
});

export const activitySeed: ActivityEntry[] = [
  a("18:45", "cos", "model_call", "Wrote tonight's handover from 4 agents' output", { ...call("cos", 18420, 1260, 9140), detail: "trigger=handover · window 19:00–23:00 (240 min) · planned 190 min" }),
  a("18:44", "cos", "tool_call", "read_agent_output for revenue, support, ship, scout", { runtime: "hermes", ms: 212, detail: "openhq.read_agent_output({ since: \"09:00\" })" }),
  a("18:40", "ship", "tool_call", "GITHUB_LIST_DEPLOYMENTS on CipherKuma/tidyform", { runtime: "hermes", ms: 640, detail: "{ repo: \"CipherKuma/tidyform\", per_page: 10 }" }),
  a("18:40", "ship", "model_call", "Compared v1.9.1 error rate with the hour before", call("ship", 6210, 380, 3120)),
  a("18:31", "support", "model_call", "Sorted 2 new emails, both routine", call("support", 4890, 610, 2870)),
  a("18:31", "support", "tool_call", "GMAIL_FETCH_EMAILS since 18:15", { runtime: "hermes", ms: 910, detail: "{ query: \"is:unread newer_than:1h\" }" }),
  a("18:10", "ship", "proposal", "Proposed: open an issue for the CSV export bug", { runtime: "app", detail: "github_issue · CipherKuma/tidyform" }),
  a("17:20", "revenue", "model_call", "End-of-day MRR summary", call("revenue", 3920, 240, 2210)),
  a("17:05", "scout", "proposal", "Proposed: r/SaaS launch thread, Wed 20:00", { runtime: "app", detail: "social_post · reddit/SaaS" }),
  a("17:04", "scout", "model_call", "Drafted the launch thread leading with the $12 plan", call("scout", 7340, 1910, 6480, "loop")),
  a("16:24", "support", "proposal", "Proposed: reply to Marta Kowalski", { runtime: "app", detail: "email_reply · depends on prop_refund_marta" }),
  a("16:20", "revenue", "proposal", "Proposed: refund duplicate $29 charge", { runtime: "app", detail: "stripe_refund · ch_3Q7mWk…" }),
  a("16:13", "support", "message", "Back room: agreed to hold the retry email", { runtime: "hermes", detail: "backroom:failed-cards" }),
  a("16:12", "revenue", "model_call", "Checked failed cards against open tickets", call("revenue", 5110, 330, 2640)),
  a("14:20", "cos", "model_call", "Back room: Formspark price, adjusted this week's plan", call("cos", 9820, 520, 5900)),
  a("14:12", "you", "execution", "Rollback v1.9.0 → v1.8.2 executed after your approval", { runtime: "app", ms: 4210, detail: "deploy_rollback · payloadHash a1b3c5d7…" }),
  a("14:10", "ship", "proposal", "Urgent: proposed rollback of v1.9.0", { runtime: "app", detail: "rule checkout_failing · pushed to Telegram" }),
  a("14:09", "ship", "tool_call", "SENTRY_LIST_ISSUES for the last 15 minutes", { runtime: "hermes", ms: 780, detail: "{ project: \"tidyform\", statsPeriod: \"15m\" }" }),
  a("14:02", "scout", "tool_call", "web_fetch formspark.io/pricing", { runtime: "loop", ms: 1320, detail: "GET https://formspark.io/pricing" }),
  a("12:30", "cos", "model_call", "Midday check: nothing needs Cipher before tonight", call("cos", 11240, 210, 6020)),
  a("10:12", "revenue", "tool_call", "STRIPE_LIST_CHARGES status=failed", { runtime: "hermes", ms: 560, detail: "{ created: { gte: today_09_00 } }" }),
  a("03:00", "system", "job", "Nebius Serverless Job: NeMo Guardrails pass over yesterday's drafts", { runtime: "nebius_job", ms: 184000, detail: "0 drafts flagged · 41 checked" }),
];
