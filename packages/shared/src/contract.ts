// Shared API contract between apps/api (Cloudflare Worker) and apps/web (React SPA).
// Every request body and response crossing the boundary is validated with these schemas.
import { z } from "zod";

export const AgentId = z.enum(["cos", "revenue", "support", "ship", "scout"]);
export type AgentId = z.infer<typeof AgentId>;

export const AGENTS: Record<AgentId, { name: string; short: string; job: string }> = {
  cos: { name: "Chief of Staff", short: "CS", job: "Runs your evening: handover, ranking, tonight's list, weekly plan." },
  revenue: { name: "Revenue", short: "RV", job: "Watches money: customers, failed payments, cancellations, MRR." },
  support: { name: "Support", short: "SP", job: "Reads every customer message, sorts it, drafts replies." },
  ship: { name: "Ship", short: "SH", job: "Watches code and production: deploys, errors, PRs." },
  scout: { name: "Scout", short: "SC", job: "Watches growth and the market: traffic, mentions, competitors." },
};

export const Level = z.enum(["urgent", "tonight", "week"]);
export type Level = z.infer<typeof Level>;

export const Product = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string(),
  tagline: z.string(),
});
export type Product = z.infer<typeof Product>;

// Times are "HH:MM" in the founder's timezone; days are 0=Sun..6=Sat.
export const Block = z.object({ days: z.array(z.number().int().min(0).max(6)), start: z.string(), end: z.string() });
export const Schedule = z.object({
  timezone: z.string(), // IANA, e.g. "Asia/Kuala_Lumpur"
  dayJob: z.array(Block),
  founderHours: z.array(Block),
  handoverLeadMinutes: z.number().int().min(0).max(120), // handover lands this long before founder hours
  urgentRules: z.array(z.string()), // e.g. ["site_down", "checkout_failing", "security"]
  channel: z.enum(["app", "email", "telegram", "slack", "discord"]),
});
export type Schedule = z.infer<typeof Schedule>;

export const ChannelKind = z.enum(["dm", "group", "backroom"]);
export const Channel = z.object({
  id: z.string(), // "dm:revenue" | "group:<uuid>" | "backroom:<uuid>"
  kind: ChannelKind,
  name: z.string(),
  members: z.array(z.union([AgentId, z.literal("you")])),
  unread: z.number().int(),
  lastAt: z.string().nullable(), // ISO
});
export type Channel = z.infer<typeof Channel>;

export const Author = z.union([AgentId, z.literal("you"), z.literal("system")]);
export const Message = z.object({
  id: z.string(),
  channelId: z.string(),
  author: Author,
  text: z.string(), // markdown-lite: **bold**, `code`, links
  createdAt: z.string(),
  heldDuringWork: z.boolean(), // queued while the founder was at the day job
  level: Level.nullable(),
  proposalId: z.string().nullable(), // renders an inline approval card
  mentions: z.array(AgentId), // agents addressed with @
  refs: z.array(z.object({ label: z.string(), url: z.string() })), // links to Stripe/GitHub/Sentry objects
});
export type Message = z.infer<typeof Message>;

export const ProposalStatus = z.enum(["pending", "approved", "executing", "done", "failed", "declined"]);
export const ProposalKind = z.enum([
  "stripe_refund",
  "email_reply",
  "github_issue",
  "github_revert",
  "deploy_rollback",
  "social_post",
  "standing_order",
  "memory",
]);
export const Proposal = z.object({
  id: z.string(),
  agent: AgentId,
  productId: z.string().nullable(),
  kind: ProposalKind,
  title: z.string(),
  why: z.string(),
  payload: z.record(z.unknown()), // exact action the runner will execute; approval hashes this
  payloadHash: z.string(),
  status: ProposalStatus,
  level: Level,
  createdAt: z.string(),
  decidedAt: z.string().nullable(),
  result: z.object({ ok: z.boolean(), detail: z.string(), url: z.string().nullable() }).nullable(),
  dependsOn: z.string().nullable(),
});
export type Proposal = z.infer<typeof Proposal>;

export const Decision = z.object({
  decision: z.enum(["approve", "decline"]),
  payloadHash: z.string(), // must equal the proposal's hash: the runner executes only what was shown
});

export const TodoItem = z.object({ id: z.string(), title: z.string(), minutes: z.number().int(), agent: AgentId.nullable(), productId: z.string().nullable(), done: z.boolean() });
export const Handover = z.object({
  date: z.string(), // YYYY-MM-DD
  window: z.object({ start: z.string(), end: z.string(), minutes: z.number().int() }),
  since: z.array(z.object({ agent: AgentId, text: z.string() })),
  decisions: z.array(Proposal),
  todo: z.array(TodoItem),
  plannedMinutes: z.number().int(),
  status: z.enum(["normal", "attention", "urgent"]),
  generatedAt: z.string(),
  model: z.string(),
});
export type Handover = z.infer<typeof Handover>;

export const Point = z.object({ t: z.string(), v: z.number() });
export const Dashboard = z.object({
  product: Product,
  mrr: z.object({ value: z.number(), delta: z.number(), series: z.array(Point) }),
  customers: z.object({ value: z.number(), delta: z.number() }),
  failedPayments: z.number(),
  deploys: z.array(z.object({ id: z.string(), at: z.string(), state: z.enum(["ok", "failed", "rolled_back"]), ref: z.string() })),
  errorRate: z.object({ value: z.number(), series: z.array(Point) }),
  openTickets: z.number(),
  traffic: z.object({ value: z.number(), delta: z.number(), series: z.array(Point) }),
  source: z.record(z.string()), // metric -> where it came from, e.g. { mrr: "Stripe (sandbox) via Composio" }
});
export type Dashboard = z.infer<typeof Dashboard>;

export const Connection = z.object({
  toolkit: z.string(), // Composio slug, lower-case: "github", "stripe", "gmail", "sentry", ...
  name: z.string(),
  pipeline: z.enum(["build", "ship", "money", "support", "growth", "comms"]),
  agents: z.array(AgentId),
  status: z.enum(["connected", "available", "needs_app", "direct"]),
  account: z.string().nullable(), // e.g. "CipherKuma/tidyform"
  readTools: z.array(z.string()),
  lastReadAt: z.string().nullable(),
});
export type Connection = z.infer<typeof Connection>;

export const AgentProfile = z.object({
  id: AgentId,
  name: z.string(),
  job: z.string(),
  model: z.string(),
  runtime: z.enum(["hermes", "loop"]), // which runtime served the last run
  soul: z.string(), // the agent's SOUL.md (role and voice)
  memory: z.array(z.object({ id: z.string(), text: z.string(), source: z.string(), createdAt: z.string() })),
  standingOrders: z.array(z.object({ id: z.string(), text: z.string() })),
  tools: z.array(z.object({ name: z.string(), toolkit: z.string(), access: z.enum(["read", "propose"]) })),
  schedule: z.array(z.object({ cron: z.string(), task: z.string() })),
  spendToday: z.object({ usd: z.number(), tokens: z.number(), budgetUsd: z.number() }),
  lastRunAt: z.string().nullable(),
});
export type AgentProfile = z.infer<typeof AgentProfile>;

export const ActivityEntry = z.object({
  id: z.string(),
  at: z.string(),
  agent: Author,
  kind: z.enum(["model_call", "tool_call", "message", "proposal", "execution", "job"]),
  summary: z.string(),
  model: z.string().nullable(),
  tokensIn: z.number().nullable(),
  tokensOut: z.number().nullable(),
  usd: z.number().nullable(),
  ms: z.number().nullable(),
  runtime: z.enum(["hermes", "loop", "nebius_job", "app"]).nullable(),
  detail: z.string().nullable(), // tool name + args, or prompt excerpt
});
export type ActivityEntry = z.infer<typeof ActivityEntry>;

export const Workspace = z.object({
  id: z.string(),
  founder: z.string(),
  products: z.array(Product),
  schedule: Schedule,
  agents: z.array(z.object({ id: AgentId, name: z.string(), status: z.enum(["idle", "working", "waiting"]), lastRunAt: z.string().nullable() })),
});
export type Workspace = z.infer<typeof Workspace>;

export const PostMessage = z.object({ text: z.string().min(1).max(4000) });
export const CreateGroup = z.object({ name: z.string().min(1).max(60), agents: z.array(AgentId).min(1) });
export const ApiError = z.object({ error: z.string(), code: z.string().optional() });

// Server -> browser push over WebSocket at /api/live
export const LiveEvent = z.discriminatedUnion("type", [
  z.object({ type: z.literal("message"), data: Message }),
  z.object({ type: z.literal("proposal"), data: Proposal }),
  z.object({ type: z.literal("activity"), data: ActivityEntry }),
  z.object({ type: z.literal("agent_status"), data: z.object({ id: AgentId, status: z.enum(["idle", "working", "waiting"]) }) }),
  z.object({ type: z.literal("handover"), data: Handover }),
]);
export type LiveEvent = z.infer<typeof LiveEvent>;

/*
Routes (all JSON; errors are ApiError with a 4xx/5xx status, never a stack trace):
  GET    /api/workspace                      -> Workspace
  GET    /api/handover                       -> Handover (latest; ?regenerate=1 runs the Chief of Staff now)
  GET    /api/channels                       -> Channel[]
  GET    /api/channels/:id/messages          -> Message[]   (?before=ISO, newest last, max 100)
  POST   /api/channels/:id/messages          PostMessage -> Message (agents reply asynchronously via /api/live)
  POST   /api/groups                         CreateGroup -> Channel
  GET    /api/proposals                      -> Proposal[]  (?status=pending)
  POST   /api/proposals/:id/decision         Decision -> Proposal (approve: runner executes, result via /api/live)
  GET    /api/products/:id/dashboard         -> Dashboard
  GET    /api/agents/:id                     -> AgentProfile
  GET    /api/schedule | PUT /api/schedule   Schedule
  GET    /api/connections                    -> Connection[]
  POST   /api/connections/:toolkit/link      -> { redirectUrl }
  GET    /api/activity                       -> ActivityEntry[] (?agent=&limit=)
  POST   /api/demo/workday                   -> { runId } runs every agent's shift now against the real connections
  GET    /api/live                           WebSocket upgrade, LiveEvent stream
  POST   /api/ingest                         Nebius Job results, Authorization: Bearer INGEST_SECRET
  POST   /api/webhooks/composio              Composio trigger events, signature checked
*/
