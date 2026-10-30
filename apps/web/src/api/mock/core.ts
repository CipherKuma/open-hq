import type { Channel, Handover, Product, Proposal, Schedule, Workspace } from "@open-hq/shared";
import { at, klDate } from "./clock";

export const products: Product[] = [
  { id: "tidyform", name: "Tidyform", url: "https://tidyform.pages.dev", tagline: "Form backend for indie sites · $12/mo" },
  { id: "quillbill", name: "Quillbill", url: "https://quillbill.pages.dev", tagline: "Invoicing for freelance translators · $29/mo" },
];

export const schedule: Schedule = {
  timezone: "Asia/Kuala_Lumpur",
  dayJob: [{ days: [1, 2, 3, 4, 5, 6], start: "09:00", end: "18:00" }],
  founderHours: [
    { days: [1, 2, 3, 4, 5, 6], start: "19:00", end: "23:00" },
    { days: [0], start: "10:00", end: "16:00" },
  ],
  handoverLeadMinutes: 15,
  urgentRules: ["site_down", "checkout_failing", "security"],
  channel: "telegram",
};

export const workspace: Workspace = {
  id: "ws_cipherkuma",
  founder: "Cipher Kuma",
  products,
  schedule,
  agents: [
    { id: "cos", name: "Chief of Staff", status: "idle", lastRunAt: at("18:45") },
    { id: "revenue", name: "Revenue", status: "idle", lastRunAt: at("18:00") },
    { id: "support", name: "Support", status: "idle", lastRunAt: at("18:31") },
    { id: "ship", name: "Ship", status: "idle", lastRunAt: at("18:40") },
    { id: "scout", name: "Scout", status: "idle", lastRunAt: at("16:05") },
  ],
};

export const channels: Channel[] = [
  { id: "dm:cos", kind: "dm", name: "Chief of Staff", members: ["you", "cos"], unread: 1, lastAt: at("18:45") },
  { id: "dm:revenue", kind: "dm", name: "Revenue", members: ["you", "revenue"], unread: 2, lastAt: at("17:20") },
  { id: "dm:support", kind: "dm", name: "Support", members: ["you", "support"], unread: 3, lastAt: at("18:31") },
  { id: "dm:ship", kind: "dm", name: "Ship", members: ["you", "ship"], unread: 0, lastAt: at("16:40") },
  { id: "dm:scout", kind: "dm", name: "Scout", members: ["you", "scout"], unread: 1, lastAt: at("14:02") },
  { id: "group:launch-week", kind: "group", name: "launch-week", members: ["you", "ship", "scout", "cos"], unread: 3, lastAt: at("18:45") },
  { id: "group:billing-fixes", kind: "group", name: "billing-fixes", members: ["you", "revenue", "support"], unread: 0, lastAt: at("19:40", -1) },
  { id: "backroom:failed-cards", kind: "backroom", name: "Failed cards with open tickets", members: ["revenue", "support"], unread: 0, lastAt: at("16:14") },
  { id: "backroom:checkout-errors", kind: "backroom", name: "Checkout errors after v1.9.0", members: ["ship", "revenue"], unread: 0, lastAt: at("14:16") },
  { id: "backroom:formspark-price", kind: "backroom", name: "Formspark price cut", members: ["scout", "cos"], unread: 0, lastAt: at("14:20") },
];

const reply = `Hi Marta,\n\nYou're right: your card was charged twice for October (invoice QB-2291 on 1 Oct and again on 2 Oct). I've refunded the second $29 charge; it should be back on your card in 5 to 10 days.\n\nSorry for the trouble.\nCipher, Quillbill`;

export const proposals: Proposal[] = [
  {
    id: "prop_refund_marta", agent: "revenue", productId: "quillbill", kind: "stripe_refund",
    title: "Refund Marta Kowalski's duplicate October charge ($29)",
    why: "Stripe shows two successful $29 charges on 1 and 2 Oct for the same invoice period. She wrote to support about it this morning.",
    payload: { charge: "ch_3Q7mWkLg1Qb8r2Zx0aT4Hc9e", amount: 2900, currency: "usd", reason: "duplicate", customer: "cus_QzR8fK2nLwVb3T" },
    payloadHash: "9f3c1a6e0d2b47f58ac91e7d3b6f0a2c4e8d1b9a7c5f3e1d0b2a4c6e8f9d1b3a",
    status: "pending", level: "tonight", createdAt: at("16:20"), decidedAt: null, result: null, dependsOn: null,
  },
  {
    id: "prop_reply_marta", agent: "support", productId: "quillbill", kind: "email_reply",
    title: "Reply to Marta Kowalski: double-charged in October",
    why: "Paying customer since March, polite but this is her second message. The reply confirms the refund above.",
    payload: { to: "marta@kowalski-translations.pl", subject: "Re: Charged twice for October?", threadId: "18f2c9a0d4e1b7a3", body: reply },
    payloadHash: "2b8e4d6f1a3c5e7092b4d6f8a0c2e4f6183a5c7e9b1d3f5a7c9e1b3d5f7a9c1e",
    status: "pending", level: "tonight", createdAt: at("16:24"), decidedAt: null, result: null, dependsOn: "prop_refund_marta",
  },
  {
    id: "prop_reddit_launch", agent: "scout", productId: "tidyform", kind: "social_post",
    title: "Post the Tidyform launch thread on r/SaaS, Wed 20:00",
    why: "Formspark raised Pro to $19 today. Three of this week's trials came from their comparison page, so the post leads with Tidyform's $12 plan.",
    payload: { platform: "reddit", subreddit: "SaaS", scheduledFor: `${klDate(5)}T20:00:00+08:00`, title: "I built a $12/mo form backend for static sites. Here's what 107 customers taught me", bodyChars: 1840 },
    payloadHash: "c71e5a3f9b2d4806e1a3c5b7d9f0e2a4c6b8d0f1e3a5c7b9d1f3e5a7c9b0d2f4",
    status: "pending", level: "week", createdAt: at("17:05"), decidedAt: null, result: null, dependsOn: null,
  },
  {
    id: "prop_card_retry", agent: "revenue", productId: "tidyform", kind: "email_reply",
    title: "Send the card-retry email to 2 Tidyform customers",
    why: "Both cards failed on renewal. Support asked to answer their open tickets first, so this waits until those replies go out.",
    payload: { to: ["owen@larchpress.studio", "hello@pikku.design"], template: "card_retry_v2", subject: "Your Tidyform card didn't go through" },
    payloadHash: "5d0a2c4e6f8b1d3a5c7e9f0b2d4a6c8e1f3b5d7a9c0e2f4b6d8a1c3e5f7b9d0a",
    status: "pending", level: "tonight", createdAt: at("17:20"), decidedAt: null, result: null, dependsOn: "prop_reply_marta",
  },
  {
    id: "prop_csv_issue", agent: "ship", productId: "tidyform", kind: "github_issue",
    title: "Open an issue: CSV export drops rows that contain commas",
    why: "Three support emails this week describe the same missing rows. Sentry has no error because the export succeeds; the quoting is wrong.",
    payload: { repo: "CipherKuma/tidyform", title: "CSV export drops submissions whose fields contain commas", labels: ["bug", "export"], body: "Reported by 3 customers (Support threads linked). `exportCsv()` joins fields with `,` without quoting. Repro: submit a form with `Kuala Lumpur, MY` in any field, export, row is split." },
    payloadHash: "e4f6a8c0b2d4e6f8a1c3e5b7d9f0a2c4e6b8d1f3a5c7e9b0d2f4a6c8e0b1d3f5",
    status: "pending", level: "week", createdAt: at("18:10"), decidedAt: null, result: null, dependsOn: null,
  },
  {
    id: "prop_rollback_v190", agent: "ship", productId: "tidyform", kind: "deploy_rollback",
    title: "Roll Tidyform back from v1.9.0 to v1.8.2",
    why: "12 checkout errors in 5 minutes since the v1.9.0 deploy at 14:04. Urgent rule: checkout_failing.",
    payload: { project: "tidyform", from: "v1.9.0", to: "v1.8.2", deployment: "d_8f21c0" },
    payloadHash: "a1b3c5d7e9f0a2b4c6d8e0f1a3b5c7d9e1f2a4b6c8d0e1f3a5b7c9d0e2f4a6b8",
    status: "done", level: "urgent", createdAt: at("14:10"), decidedAt: at("14:12"),
    result: { ok: true, detail: "Rolled back to v1.8.2. Checkout errors back to zero by 14:15.", url: "https://github.com/CipherKuma/tidyform/deployments" },
    dependsOn: null,
  },
  {
    id: "prop_memory_tone", agent: "support", productId: null, kind: "memory",
    title: "Remember: sign replies as \"Cipher\", never \"the Tidyform team\"",
    why: "You edited the last four drafts to change the sign-off.",
    payload: { agent: "support", text: "Sign replies as \"Cipher\". Never \"the Tidyform team\"." },
    payloadHash: "f0e2d4c6b8a0f1e3d5c7b9a1f2e4d6c8b0a1f3e5d7c9b1a2f4e6d8c0b2a3f5e7",
    status: "declined", level: "week", createdAt: at("19:20", -1), decidedAt: at("21:02", -1), result: null, dependsOn: null,
  },
];

export const handover = (): Handover => ({
  date: klDate(),
  window: { start: "19:00", end: "23:00", minutes: 240 },
  since: [
    { agent: "revenue", text: "+2 customers on Tidyform, MRR $1,284 (+$24). Two cards failed on renewal; Support is answering their tickets before any retry email." },
    { agent: "ship", text: "3 deploys. v1.9.0 broke checkout at 14:04; you approved the rollback from your phone at 14:12. The other two are healthy." },
    { agent: "support", text: "9 new emails, 6 answered from saved replies. Marta Kowalski (Quillbill) was charged twice in October; reply and refund are drafted." },
    { agent: "scout", text: "Formspark moved Pro to $19. Organic signups up 18% week on week, mostly from their comparison page." },
  ],
  decisions: proposals.filter((p) => p.status === "pending"),
  todo: [
    { id: "t1", title: "Review the pricing-table PR #48", minutes: 20, agent: "ship", productId: "tidyform", done: false },
    { id: "t2", title: "Approve tonight's 5 decisions", minutes: 5, agent: "cos", productId: null, done: false },
    { id: "t3", title: "Fix the CSV export quoting bug (3 reports)", minutes: 75, agent: "ship", productId: "tidyform", done: false },
    { id: "t4", title: "Record the 60-second launch demo", minutes: 60, agent: "scout", productId: "tidyform", done: false },
    { id: "t5", title: "Write the v1.9.1 changelog", minutes: 30, agent: null, productId: "tidyform", done: false },
  ],
  plannedMinutes: 190,
  status: "attention",
  generatedAt: at("18:45"),
  model: "nvidia/nemotron-3-ultra",
});
