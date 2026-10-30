import { afterEach, describe, expect, it, vi } from "vitest";
import type { Proposal } from "@open-hq/shared";
import { READ_ALLOWLIST, WRITE_TOOLS, allowedFor } from "./allowlists";
import { CATALOG } from "./catalog";
import { callReadTool, execute, verifyComposioWebhook, WebhookAuthError } from "./index";
import { assertPublicUrl, extractText } from "./webfetch";

const env = { COMPOSIO_API_KEY: "test-key", COMPOSIO_WEBHOOK_SECRET: "whsec_test" };
const READ_VERB = /^[A-Z]+_(LIST|GET|RETRIEVE|FETCH)_/;
const WRITE_WORDS = /_(CREATE|DELETE|UPDATE|POST|SEND|REPLY|MERGE|PATCH|REMOVE|FORWARD|INSERT|IMPORT|MODIFY|TRASH|CANCEL)_/;

afterEach(() => vi.unstubAllGlobals());

describe("read allowlists", () => {
  it("contain only read-verb Composio slugs", () => {
    for (const [agent, reads] of Object.entries(READ_ALLOWLIST)) {
      for (const slug of Object.values(reads.tools).flat()) { expect(slug, `${agent}:${slug}`).toMatch(READ_VERB); expect(slug).not.toMatch(WRITE_WORDS); }
    }
  });
  it("never overlap with the write tool set except identity reads", () => {
    const reads = new Set(Object.values(READ_ALLOWLIST).flatMap((r) => Object.values(r.tools).flat()));
    for (const slug of Object.values(WRITE_TOOLS).flat()) {
      if (reads.has(slug)) expect(slug).toMatch(/(GET|RETRIEVE|FETCH)/);
    }
  });
  it("callReadTool rejects tools outside the agent's list before any network call", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await expect(callReadTool("revenue", "STRIPE_CREATE_REFUND", {}, env)).rejects.toMatchObject({ code: "tool_not_allowed" });
    await expect(callReadTool("support", "STRIPE_LIST_CUSTOMERS", {}, env)).rejects.toMatchObject({ code: "tool_not_allowed" });
    await expect(callReadTool("revenue", "GMAIL_SEND_EMAIL", {}, env)).rejects.toMatchObject({ code: "tool_not_allowed" });
    await expect(callReadTool("cos", "STRIPE_LIST_CUSTOMERS", {}, env)).rejects.toMatchObject({ code: "tool_not_allowed" });
    await expect(callReadTool("ship", "web_fetch_public_page", { url: "https://example.com" }, env)).rejects.toMatchObject({ code: "tool_not_allowed" });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(allowedFor("cos").size).toBe(0);
  });
});

describe("catalog", () => {
  it("has ~40 unique toolkits across the six pipelines", () => {
    expect(CATALOG.length).toBeGreaterThanOrEqual(40);
    expect(new Set(CATALOG.map((c) => c.toolkit)).size).toBe(CATALOG.length);
    expect(new Set(CATALOG.map((c) => c.pipeline))).toEqual(new Set(["build", "ship", "money", "support", "growth", "comms"]));
    expect(CATALOG.filter((c) => c.base === "direct").map((c) => c.toolkit).sort()).toEqual(["dodo_payments", "paddle", "product_hunt"]);
  });
});

function proposal(kind: Proposal["kind"], payload: Record<string, unknown>): Proposal {
  return { id: "p1", agent: "revenue", productId: "quillbill", kind, title: "t", why: "w", payload, payloadHash: "h", status: "approved", level: "tonight", createdAt: "", decidedAt: "", result: null, dependsOn: null };
}

function composioFake(balance: Record<string, unknown>) {
  const executed: string[] = [];
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { "content-type": "application/json" } });
    if (url.includes("/connected_accounts")) return json({ items: [] });
    if (url.endsWith("/tool_router/session")) return json({ session_id: "trs_fake", mcp: { url: "https://x/mcp" } });
    if (url.endsWith("/execute")) {
      const slug = JSON.parse(String(init?.body)).tool_slug as string;
      executed.push(slug);
      if (slug === "STRIPE_RETRIEVE_BALANCE") return json({ data: balance, successful: true });
      if (slug === "STRIPE_CREATE_REFUND") return json({ data: { id: "re_1", amount: 2900, currency: "usd", status: "succeeded" }, successful: true });
    }
    return new Response("{}", { status: 404 });
  });
  vi.stubGlobal("fetch", fn);
  return executed;
}

describe("execute", () => {
  it("refuses a Stripe refund on a live-mode account and never calls the refund tool", async () => {
    const executed = composioFake({ object: "balance", livemode: true });
    const r = await execute(proposal("stripe_refund", { charge: "ch_123", reason: "duplicate" }), env);
    expect(r.ok).toBe(false);
    expect(r.detail).toMatch(/live mode/i);
    expect(executed).not.toContain("STRIPE_CREATE_REFUND");
  });
  it("refuses when the account mode cannot be confirmed", async () => {
    const executed = composioFake({ object: "balance" });
    const r = await execute(proposal("stripe_refund", { charge: "ch_123" }), env);
    expect(r.ok).toBe(false);
    expect(executed).not.toContain("STRIPE_CREATE_REFUND");
  });
  it("refunds on a sandbox account", async () => {
    const executed = composioFake({ object: "balance", livemode: false });
    const r = await execute(proposal("stripe_refund", { charge: "ch_123", reason: "duplicate" }), env);
    expect(r).toMatchObject({ ok: true, url: "https://dashboard.stripe.com/test/refunds/re_1" });
    expect(executed).toEqual(["STRIPE_RETRIEVE_BALANCE", "STRIPE_CREATE_REFUND"]);
  });
  it("rejects an invalid payload without calling out", async () => {
    const fn = vi.fn();
    vi.stubGlobal("fetch", fn);
    const r = await execute(proposal("stripe_refund", { amount: -5 }), env);
    expect(r.ok).toBe(false);
    expect(fn).not.toHaveBeenCalled();
  });
  it("social_post returns not connected", async () => {
    expect(await execute(proposal("social_post", { text: "hi" }), env)).toEqual({ ok: false, detail: "not connected", url: null });
  });
  it("deploy_rollback without Cloudflare credentials says so", async () => {
    const r = await execute(proposal("deploy_rollback", {}), env);
    expect(r.ok).toBe(false);
    expect(r.detail).toMatch(/Cloudflare is not connected/);
  });
});

describe("web fetch safety", () => {
  it("blocks private and non-http targets", () => {
    for (const u of ["http://localhost/", "http://127.0.0.1/", "http://10.0.0.5/", "http://192.168.1.1/", "http://169.254.169.254/latest", "ftp://example.com", "https://user:pw@example.com", "http://[::1]/", "http://example.com:8080/", "http://intranet/", "https://foo.internal/"]) {
      expect(() => assertPublicUrl(u), u).toThrow();
    }
    expect(assertPublicUrl("https://tally.so/pricing").hostname).toBe("tally.so");
  });
  it("extracts readable text and drops scripts", () => {
    const r = extractText("<html><head><title>Formspree &amp; co</title><meta name='description' content='Forms'></head><body><script>evil()</script><h1>Pricing</h1><p>$10&nbsp;/mo</p></body></html>");
    expect(r.title).toBe("Formspree & co");
    expect(r.description).toBe("Forms");
    expect(r.text).toContain("Pricing");
    expect(r.text).not.toContain("evil");
  });
});

async function signed(body: string, secret = env.COMPOSIO_WEBHOOK_SECRET, ts = String(Math.floor(Date.now() / 1000))) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`msg_1.${ts}.${body}`)))));
  return new Request("https://openhq.pages.dev/api/webhooks/composio", { method: "POST", body, headers: { "webhook-id": "msg_1", "webhook-timestamp": ts, "webhook-signature": `v1,${sig}` } });
}

describe("composio webhooks", () => {
  const push = JSON.stringify({ id: "msg_1", type: "composio.trigger.message", metadata: { trigger_slug: "GITHUB_COMMIT_EVENT" }, data: { author: "CipherKuma", message: "feat: checkout\n\nbody" }, timestamp: "2026-10-30T10:00:00Z" });
  it("normalizes a GitHub push to the ship agent", async () => {
    const e = await verifyComposioWebhook(await signed(push), env);
    expect(e).toMatchObject({ source: "github", type: "github.push", agent: "ship", productId: "tidyform", at: "2026-10-30T10:00:00Z" });
    expect(e?.summary).toBe("Push by CipherKuma: feat: checkout");
  });
  it("rejects a bad signature, wrong secret and stale timestamp", async () => {
    await expect(verifyComposioWebhook(await signed(push, "wrong"), env)).rejects.toBeInstanceOf(WebhookAuthError);
    await expect(verifyComposioWebhook(await signed(push, env.COMPOSIO_WEBHOOK_SECRET, "1700000000"), env)).rejects.toBeInstanceOf(WebhookAuthError);
    const tampered = await signed(push);
    await expect(verifyComposioWebhook(new Request(tampered.url, { method: "POST", body: push + " ", headers: tampered.headers }), env)).rejects.toBeInstanceOf(WebhookAuthError);
  });
  it("ignores verified events the app does not act on, and non-failing workflow runs", async () => {
    const expired = JSON.stringify({ type: "composio.connected_account.expired", data: {} });
    expect(await verifyComposioWebhook(await signed(expired), env)).toBeNull();
    const ok = JSON.stringify({ type: "composio.trigger.message", metadata: { trigger_slug: "GITHUB_WORKFLOW_RUN_STATE_CHANGED_TRIGGER" }, data: { conclusion: "success" } });
    expect(await verifyComposioWebhook(await signed(ok), env)).toBeNull();
    const bad = JSON.stringify({ type: "composio.trigger.message", metadata: { trigger_slug: "GITHUB_WORKFLOW_RUN_STATE_CHANGED_TRIGGER" }, data: { conclusion: "failure", name: "CI" } });
    expect((await verifyComposioWebhook(await signed(bad), env))?.type).toBe("github.workflow_failure");
  });
  it("routes Gmail to support and Stripe failures to revenue", async () => {
    const mail = JSON.stringify({ type: "composio.trigger.message", metadata: { trigger_slug: "GMAIL_NEW_GMAIL_MESSAGE" }, data: { sender: "marta@example.pl", subject: "Charged twice" } });
    expect(await verifyComposioWebhook(await signed(mail), env)).toMatchObject({ agent: "support", type: "gmail.new_message" });
    const pay = JSON.stringify({ type: "composio.trigger.message", metadata: { trigger_slug: "STRIPE_CHARGE_FAILED" }, data: { failure_message: "Your card was declined." } });
    expect(await verifyComposioWebhook(await signed(pay), env)).toMatchObject({ agent: "revenue", type: "stripe.payment_failed" });
  });
});
