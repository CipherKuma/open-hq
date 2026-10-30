// Payload schemas for each executable proposal kind. The proposing agent fills these; the approval hash
// covers the exact payload, so what the founder approved is what runs.
import { z } from "zod";

const repoField = { owner: z.string().regex(/^[A-Za-z0-9-]+$/).default("CipherKuma"), repo: z.string().regex(/^[A-Za-z0-9._-]+$/).default("tidyform") };

export const StripeRefundPayload = z
  .object({
    charge: z.string().regex(/^ch_|^py_/).optional(),
    paymentIntent: z.string().regex(/^pi_/).optional(),
    amount: z.number().int().positive().optional(), // minor units; omit for a full refund
    reason: z.enum(["duplicate", "requested_by_customer", "fraudulent"]).default("duplicate"),
    customerEmail: z.string().optional(), // display only
  })
  .refine((p) => p.charge || p.paymentIntent, { message: "charge or paymentIntent is required" });

export const EmailReplyPayload = z.object({
  threadId: z.string().min(4),
  to: z.string().email(),
  body: z.string().min(1).max(8000),
  cc: z.array(z.string().email()).max(5).optional(),
});

export const GithubIssuePayload = z.object({
  ...repoField,
  title: z.string().min(3).max(256),
  body: z.string().max(20000).optional(),
  labels: z.array(z.string().max(50)).max(8).optional(),
});

export const GithubRevertPayload = z.object({
  ...repoField,
  sha: z.string().regex(/^[0-9a-f]{7,40}$/i),
  baseBranch: z.string().max(100).default("main"),
  reason: z.string().max(500).optional(),
});

export const DeployRollbackPayload = z.object({
  project: z.string().regex(/^[A-Za-z0-9_-]+$/).optional(), // default: the Tidyform Pages project
  deploymentId: z.string().uuid().optional(), // default: the last good deployment before the live one
});

export type StripeRefund = z.infer<typeof StripeRefundPayload>;
export type GithubRevert = z.infer<typeof GithubRevertPayload>;
