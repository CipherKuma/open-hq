// execute(proposal): the approval runner's only door to the outside world. Writes go through the
// write-only Composio session. Every payload is validated; failures return ok:false, never throw raw errors.
import type { Proposal } from "@open-hq/shared";
import { asEnv, IntegrationError, type IntegrationsEnv } from "./env";
import {
  DeployRollbackPayload, EmailReplyPayload, GithubIssuePayload, GithubRevertPayload, StripeRefundPayload,
} from "./payloads";
import { githubRevert } from "./revert";
import { rollbackPages } from "./rollback";
import type { ExecResult } from "./types";
import { write } from "./writes";

const fail = (detail: string): ExecResult => ({ ok: false, detail, url: null });

/** Throws unless the connected Stripe account is verifiably a test-mode (sandbox) account. */
export async function assertStripeSandbox(env: IntegrationsEnv): Promise<void> {
  const bal = await write(env, "STRIPE_RETRIEVE_BALANCE", {});
  if (bal?.livemode === true) throw new IntegrationError("Refusing to write: the connected Stripe account is in live mode", "live_mode_refused");
  if (bal?.livemode !== false) throw new IntegrationError("Could not confirm the Stripe account is a sandbox; refusing to write", "live_mode_refused");
}

async function stripeRefund(env: IntegrationsEnv, payload: unknown): Promise<ExecResult> {
  const p = StripeRefundPayload.parse(payload);
  await assertStripeSandbox(env);
  const args: Record<string, unknown> = { reason: p.reason };
  if (p.charge) args.charge = p.charge;
  else args.payment_intent = p.paymentIntent;
  if (p.amount) args.amount = p.amount;
  const r = await write(env, "STRIPE_CREATE_REFUND", args);
  if (!r?.id) return fail("Stripe did not return a refund");
  const amt = typeof r.amount === "number" ? ` of ${(r.amount / 100).toFixed(2)} ${String(r.currency ?? "").toUpperCase()}` : "";
  return { ok: true, detail: `Refund ${r.id}${amt} (${r.status ?? "created"}), Stripe sandbox`, url: `https://dashboard.stripe.com/test/refunds/${r.id}` };
}

async function emailReply(env: IntegrationsEnv, payload: unknown): Promise<ExecResult> {
  const p = EmailReplyPayload.parse(payload);
  const r = await write(env, "GMAIL_REPLY_TO_THREAD", {
    thread_id: p.threadId, recipient_email: p.to, message_body: p.body, is_html: false, user_id: "me", ...(p.cc ? { cc: p.cc } : {}),
  });
  const id = r?.id ?? r?.response_data?.id;
  return { ok: true, detail: `Reply sent to ${p.to}`, url: id ? `https://mail.google.com/mail/u/0/#all/${r?.threadId ?? p.threadId}` : null };
}

async function githubIssue(env: IntegrationsEnv, payload: unknown): Promise<ExecResult> {
  const p = GithubIssuePayload.parse(payload);
  const r = await write(env, "GITHUB_CREATE_AN_ISSUE", { owner: p.owner, repo: p.repo, title: p.title, ...(p.body ? { body: p.body } : {}), ...(p.labels ? { labels: p.labels } : {}) });
  if (!r?.number) return fail("GitHub did not return an issue");
  return { ok: true, detail: `Opened issue #${r.number}: ${p.title}`, url: r.html_url ?? null };
}

export async function execute(proposal: Proposal, env: unknown): Promise<ExecResult> {
  try {
    const e = asEnv(env);
    switch (proposal.kind) {
      case "stripe_refund": return await stripeRefund(e, proposal.payload);
      case "email_reply": return await emailReply(e, proposal.payload);
      case "github_issue": return await githubIssue(e, proposal.payload);
      case "github_revert": return await githubRevert(e, GithubRevertPayload.parse(proposal.payload));
      case "deploy_rollback": return await rollbackPages(e, DeployRollbackPayload.parse(proposal.payload));
      case "social_post": return fail("not connected");
      default: return fail(`${proposal.kind} is applied inside the app, not by integrations`);
    }
  } catch (err) {
    if (err instanceof IntegrationError) return fail(err.message);
    if (err && typeof err === "object" && "issues" in err) return fail("The approved payload is invalid for this action");
    return fail("The action could not be completed");
  }
}
