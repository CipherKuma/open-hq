#!/usr/bin/env node
// Seeds the connected Stripe SANDBOX (through Composio's Stripe tools, as user openhq-demo) for the Open HQ demo:
// Tidyform ($12/mo) and Quillbill ($29/mo), 25 customers, subscriptions, two failed payments and a double
// charge for Marta Kowalski on Quillbill. Refuses to run unless the connected account reports livemode=false.
// Usage: node stripe-seed.mjs [--force] [--dry-run]
import { loadEnv, composio, USER_ID } from "./lib.mjs";

loadEnv();
const force = process.argv.includes("--force");
const dry = process.argv.includes("--dry-run");

const TOOLS = [
  "STRIPE_RETRIEVE_BALANCE", "STRIPE_SEARCH_CUSTOMERS", "STRIPE_CREATE_PRODUCT", "STRIPE_CREATE_PRICE", "STRIPE_CREATE_CUSTOMER",
  "STRIPE_ATTACH_PAYMENT_METHOD", "STRIPE_CREATE_SUBSCRIPTION", "STRIPE_CANCEL_SUBSCRIPTION", "STRIPE_CREATE_PAYMENT_INTENT", "STRIPE_LIST_CHARGES",
];
const accounts = (await composio(`/api/v3/connected_accounts?user_ids=${USER_ID}&toolkit_slugs=stripe&statuses=ACTIVE&limit=20`)).items ?? [];
if (!accounts.length) {
  process.stderr.write("Stripe is not connected for openhq-demo yet (OAuth link, or demo/connect-stripe-key.mjs).\n");
  process.exit(1);
}
const session = await composio("/api/v3.1/tool_router/session", {
  method: "POST",
  body: JSON.stringify({
    user_id: USER_ID, toolkits: { enable: ["stripe"] }, tools: { stripe: { enable: TOOLS } },
    connected_accounts: { stripe: accounts[0].id },
    manage_connections: { enable: false }, workbench: { enable: false }, preload: { tools: "all" }, search: { enable: false }, execute: { enable_multi_execute: false },
  }),
});

function peel(d) {
  for (let i = 0; i < 3 && d && typeof d === "object" && !Array.isArray(d); i++) {
    const inner = d.details ?? d.response_data ?? (Object.keys(d).length <= 2 ? d.data : undefined);
    if (inner && typeof inner === "object") d = inner; else break;
  }
  return d;
}
async function stripe(slug, args = {}) {
  const r = await composio(`/api/v3.1/tool_router/session/${session.session_id}/execute`, { method: "POST", body: JSON.stringify({ tool_slug: slug, arguments: args }) });
  if (r.successful === false || r.error) throw new Error(`${slug}: ${String(r.error ?? "failed").slice(0, 200)}`);
  return peel(r.data);
}

const balance = await stripe("STRIPE_RETRIEVE_BALANCE");
if (balance?.livemode !== false) {
  process.stderr.write("Refusing to run: the connected Stripe account is not confirmed as test mode (livemode must be false).\n");
  process.exit(1);
}
process.stdout.write("Connected Stripe account is in test mode. Seeding.\n");
if (dry) process.exit(0);
const found = await stripe("STRIPE_SEARCH_CUSTOMERS", { query: "description~'openhq-seed'", limit: 1 }).catch(() => null);
if ((found?.data ?? found?.customers ?? []).length && !force) {
  process.stdout.write("This sandbox already has seeded customers. Re-run with --force to add another set.\n");
  process.exit(0);
}

const TIDYFORM = [
  ["Amara Okafor", "amara.okafor"], ["Mateus Oliveira", "mateus.oliveira"], ["Ingrid Solheim", "ingrid.solheim"],
  ["Kenji Watanabe", "kenji.watanabe"], ["Priya Raghunathan", "priya.raghunathan"], ["Lucía Fernández", "lucia.fernandez"],
  ["Tomasz Nowak", "tomasz.nowak"], ["Aisha Rahman", "aisha.rahman"], ["Henrik Lindqvist", "henrik.lindqvist"],
  ["Chloé Martin", "chloe.martin"], ["Dmitri Volkov", "dmitri.volkov"], ["Sofia Papadopoulos", "sofia.papadopoulos"],
  ["Rohan Mehta", "rohan.mehta", "fail"], ["Fatima Zahra El Idrissi", "fatima.elidrissi"], ["Jonas Weber", "jonas.weber", "cancel"],
];
const QUILLBILL = [
  ["Marta Kowalski", "marta.kowalski", "double"], ["Elena Rossi", "elena.rossi"], ["Yusuf Demir", "yusuf.demir", "fail"],
  ["Anneke de Vries", "anneke.devries"], ["Camille Laurent", "camille.laurent"], ["Nikolai Petrov", "nikolai.petrov"],
  ["Hyun-woo Park", "hyunwoo.park"], ["Giulia Ferri", "giulia.ferri"], ["Mehmet Aksoy", "mehmet.aksoy"], ["Isabel Costa", "isabel.costa"],
];

async function product(id, name, description, cents) {
  const p = await stripe("STRIPE_CREATE_PRODUCT", { name, description, metadata: { openhq_product: id, openhq_seed: "1" } });
  const price = await stripe("STRIPE_CREATE_PRICE", { product: p.id, currency: "usd", unit_amount: cents, recurring: { interval: "month" }, metadata: { openhq_product: id } });
  return price.id;
}
const prices = {
  tidyform: await product("tidyform", "Tidyform Pro", "Form backend for indie sites", 1200),
  quillbill: await product("quillbill", "Quillbill", "Invoicing for freelance translators", 2900),
};
process.stdout.write(`prices: tidyform ${prices.tidyform}, quillbill ${prices.quillbill}\n`);

const report = { failed: [], double: null, cancelled: [] };
async function seedOne(productId, [name, handle, flag]) {
  const bad = flag === "fail";
  const pmToken = bad ? "pm_card_chargeCustomerFail" : "pm_card_visa";
  const customer = await stripe("STRIPE_CREATE_CUSTOMER", { name, email: `${handle}@example.com`, description: `openhq-seed ${productId}` });
  const pm = await stripe("STRIPE_ATTACH_PAYMENT_METHOD", { payment_method_id: pmToken, customer: customer.id });
  const pmId = pm?.id ?? pmToken;
  let sub;
  try {
    sub = await stripe("STRIPE_CREATE_SUBSCRIPTION", {
      customer: customer.id, items: [{ price: prices[productId] }], default_payment_method: pmId,
      payment_behavior: "allow_incomplete", metadata: { openhq_product: productId, openhq_seed: "1" },
    });
  } catch (e) {
    process.stdout.write(`  ${name}: subscription failed (${e.message.slice(0, 100)})\n`);
    return;
  }
  if (bad) {
    const charges = await stripe("STRIPE_LIST_CHARGES", { customer: customer.id, limit: 3 });
    report.failed.push({ name, customer: customer.id, sub: sub.id, status: sub.status, charge: (charges?.data ?? [])[0]?.id });
  }
  if (flag === "cancel") {
    await stripe("STRIPE_CANCEL_SUBSCRIPTION", { subscription_id: sub.id });
    report.cancelled.push({ name, sub: sub.id });
  }
  if (flag === "double") {
    const original = ((await stripe("STRIPE_LIST_CHARGES", { customer: customer.id, limit: 1 }))?.data ?? [])[0];
    const dup = await stripe("STRIPE_CREATE_PAYMENT_INTENT", {
      amount: 2900, currency: "usd", customer: customer.id, payment_method: pmId, confirm: true, off_session: true,
      description: "Quillbill monthly plan (duplicate charge)", metadata: { openhq_product: productId, openhq_seed: "1" },
    });
    report.double = { name, customer: customer.id, originalCharge: original?.id, duplicateCharge: dup.latest_charge, duplicatePaymentIntent: dup.id };
  }
  process.stdout.write(`  ${name} ${sub.status}${bad ? " (card will decline)" : ""}\n`);
}

for (const row of TIDYFORM) await seedOne("tidyform", row);
for (const row of QUILLBILL) await seedOne("quillbill", row);

process.stdout.write("\nSeed summary (IDs only):\n" + JSON.stringify(report, null, 2) + "\n");
