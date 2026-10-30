// Composio trigger webhooks: signature check (standard-webhooks style HMAC-SHA256) and normalization.
import type { AgentId } from "@open-hq/shared";
import { IntegrationError, asEnv } from "./env";
import type { NormalizedEvent } from "./types";

export class WebhookAuthError extends IntegrationError {
  constructor(message = "Invalid webhook signature") { super(message, "bad_signature"); }
}

const TOLERANCE_S = 300;
const b64 = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf)));

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export async function signatureValid(secret: string, id: string, ts: string, body: string, header: string, now = Date.now()): Promise<boolean> {
  const t = Number(ts);
  if (!Number.isFinite(t) || Math.abs(now / 1000 - t) > TOLERANCE_S) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = b64(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${ts}.${body}`)));
  // header may hold several space-separated "v1,<sig>" entries
  return header.split(" ").some((part) => safeEqual(part.includes(",") ? part.split(",")[1] : part, expected));
}

interface Route { source: string; type: string; agent: AgentId; summarize: (d: any) => string; keep?: (d: any) => boolean }
const s = (v: unknown, fb = "") => (typeof v === "string" && v ? v : fb);

const ROUTES: Record<string, Route> = {
  GITHUB_COMMIT_EVENT: { source: "github", type: "github.push", agent: "ship", summarize: (d) => `Push by ${s(d.author, "someone")}: ${s(d.message, "commit").split("\n")[0]}` },
  GITHUB_PULL_REQUEST_EVENT: { source: "github", type: "github.pull_request", agent: "ship", summarize: (d) => `PR #${d.number ?? "?"} ${s(d.action)}: ${s(d.title)}` },
  GITHUB_ISSUE_ADDED_EVENT: { source: "github", type: "github.issue", agent: "ship", summarize: (d) => `New issue #${d.number ?? "?"}: ${s(d.title)}` },
  GITHUB_WORKFLOW_RUN_STATE_CHANGED_TRIGGER: {
    source: "github", type: "github.workflow_failure", agent: "ship",
    keep: (d) => /fail|timed_out|cancel/i.test(s(d.conclusion) + s(d.state) + s(d.status)),
    summarize: (d) => `Workflow ${s(d.name, "run")} failed (${s(d.conclusion || d.state)})`,
  },
  GITHUB_DEPLOYMENT_STATE_CHANGED_TRIGGER: {
    source: "github", type: "github.deploy_failure", agent: "ship",
    keep: (d) => /fail|error/i.test(s(d.state) + s(d.status)),
    summarize: (d) => `Deployment to ${s(d.environment, "production")} ${s(d.state || d.status)}`,
  },
  GITHUB_STAR_ADDED_EVENT: { source: "github", type: "github.star", agent: "scout", summarize: (d) => `New star from ${s(d.starred_by || d.user || d.login, "someone")}` },
  GMAIL_NEW_GMAIL_MESSAGE: {
    source: "gmail", type: "gmail.new_message", agent: "support",
    summarize: (d) => `New email from ${s(d.sender || d.from, "unknown")}: ${s(d.subject, "(no subject)")}`,
  },
  STRIPE_CHARGE_FAILED: { source: "stripe", type: "stripe.payment_failed", agent: "revenue", summarize: (d) => `Charge failed: ${s(d.failure_message || d.failure_code, "declined")}` },
  STRIPE_INVOICE_PAYMENT_FAILED: { source: "stripe", type: "stripe.payment_failed", agent: "revenue", summarize: (d) => `Invoice payment failed for ${s(d.customer_email || d.customer, "a customer")}` },
  STRIPE_PAYMENT_INTENT_PAYMENT_FAILED: { source: "stripe", type: "stripe.payment_failed", agent: "revenue", summarize: () => "Payment failed" },
  STRIPE_CUSTOMER_SUBSCRIPTION_DELETED: { source: "stripe", type: "stripe.cancellation", agent: "revenue", summarize: (d) => `Subscription cancelled by ${s(d.customer, "a customer")}` },
  STRIPE_CUSTOMER_SUBSCRIPTION_CREATED: { source: "stripe", type: "stripe.new_subscription", agent: "revenue", summarize: (d) => `New subscription from ${s(d.customer, "a customer")}` },
  STRIPE_CHARGE_REFUNDED: { source: "stripe", type: "stripe.refund", agent: "revenue", summarize: (d) => `Charge ${s(d.id)} refunded` },
};

// The connected GitHub repo and the support inbox both belong to Tidyform; Stripe is shared across products.
function productFor(source: string): string | null {
  return source === "github" || source === "gmail" ? "tidyform" : null;
}

/**
 * Verifies and normalizes one Composio webhook delivery.
 * Throws WebhookAuthError on a bad or stale signature (respond 401); returns null for verified events
 * the app does not act on (respond 200).
 */
export async function verifyComposioWebhook(req: Request, env: unknown): Promise<NormalizedEvent | null> {
  const e = asEnv(env);
  const secret = e.COMPOSIO_WEBHOOK_SECRET;
  if (!secret) throw new IntegrationError("COMPOSIO_WEBHOOK_SECRET is not configured", "not_configured");
  const body = await req.text();
  const id = req.headers.get("webhook-id") ?? "";
  const ts = req.headers.get("webhook-timestamp") ?? "";
  const sig = req.headers.get("webhook-signature") ?? "";
  if (!id || !ts || !sig || !(await signatureValid(secret, id, ts, body, sig))) throw new WebhookAuthError();

  let msg: any;
  try { msg = JSON.parse(body); } catch { return null; }
  if (msg?.type !== "composio.trigger.message") return null; // e.g. connected_account.expired
  const slug = String(msg.metadata?.trigger_slug ?? msg.trigger_slug ?? "");
  const data = msg.data ?? msg.payload ?? {};
  const route = ROUTES[slug];
  if (!route || (route.keep && !route.keep(data))) return null;
  return {
    source: route.source,
    type: route.type,
    productId: productFor(route.source),
    agent: route.agent,
    summary: route.summarize(data).slice(0, 240),
    raw: msg,
    at: s(msg.timestamp, new Date().toISOString()),
  };
}

export const SUPPORTED_TRIGGERS = Object.keys(ROUTES);
