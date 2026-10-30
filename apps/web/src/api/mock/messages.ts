import type { Message } from "@open-hq/shared";
import { at } from "./clock";

type Seed = Partial<Message> & Pick<Message, "author" | "text" | "createdAt">;
let n = 0;
const m = (channelId: string, s: Seed): Message => ({
  id: `msg_${channelId.replace(/\W/g, "")}_${++n}`, channelId, heldDuringWork: false, level: null,
  proposalId: null, mentions: [], refs: [], ...s,
});

const gh = (label: string, path: string) => ({ label, url: `https://github.com/CipherKuma/tidyform/${path}` });

export const messageSeed: Message[] = [
  m("dm:cos", { author: "you", text: "Tonight I only have till 22:00, hockey runs late on Thursdays. Plan for that.", createdAt: at("21:48", -1) }),
  m("dm:cos", { author: "cos", text: "Noted. Thursday evenings now plan for **3 h**, and anything left moves to Sunday.", createdAt: at("21:49", -1) }),
  m("dm:cos", { author: "cos", text: "Midday check: checkout broke at 14:04 and you already approved the rollback. Nothing else needs you before tonight.", createdAt: at("12:30"), heldDuringWork: true, level: "tonight" }),
  m("dm:cos", { author: "cos", text: "Your handover is ready: **4 decisions** and 5 tasks that fit in tonight's 4 hours. Revenue and Support settled the failed-card question in the back room, so the retry email waits on Marta's reply.", createdAt: at("18:45"), level: "tonight", mentions: ["revenue", "support"] }),

  m("dm:revenue", { author: "revenue", text: "Two Tidyform renewals failed this morning: Owen at Larch Press ($12) and Pikku Design ($12). Both have open tickets with @support, so I'm holding the retry email.", createdAt: at("10:12"), heldDuringWork: true, level: "tonight", mentions: ["support"], refs: [{ label: "in_1Q8x… Larch Press", url: "https://dashboard.stripe.com/test/invoices" }] }),
  m("dm:revenue", { author: "revenue", text: "Marta Kowalski was charged $29 twice for October on Quillbill. I drafted the refund; it's in your decisions.", createdAt: at("16:20"), heldDuringWork: true, level: "tonight", proposalId: "prop_refund_marta", refs: [{ label: "ch_3Q7mWk… $29", url: "https://dashboard.stripe.com/test/payments" }] }),
  m("dm:revenue", { author: "revenue", text: "MRR closed the day at **$1,284** on Tidyform (+$24) and **$638** on Quillbill (flat).", createdAt: at("17:20"), heldDuringWork: true }),

  m("dm:support", { author: "support", text: "9 new emails since 09:00. 6 were answered from saved replies (password reset, custom domain, webhook retries).", createdAt: at("13:05"), heldDuringWork: true }),
  m("dm:support", { author: "support", text: "Third report this week that CSV exports drop rows. Same cause each time: a comma inside a field. Passing it to @ship.", createdAt: at("15:42"), heldDuringWork: true, level: "week", mentions: ["ship"] }),
  m("dm:support", { author: "support", text: "Marta Kowalski wrote again about the October double charge. Reply drafted in your voice; it goes out after the refund.", createdAt: at("16:24"), heldDuringWork: true, level: "tonight", proposalId: "prop_reply_marta" }),
  m("dm:support", { author: "support", text: "Nothing angry in the inbox right now. Oldest unanswered is 2 h old.", createdAt: at("18:31"), heldDuringWork: true }),

  m("dm:ship", { author: "ship", text: "**Checkout is failing on Tidyform.** 12 errors in 5 minutes since v1.9.0 deployed at 14:04. Roll back to v1.8.2?", createdAt: at("14:10"), level: "urgent", proposalId: "prop_rollback_v190", refs: [{ label: "Sentry TIDYFORM-3F", url: "https://sentry.io/organizations/cipherkuma/issues/" }, gh("v1.9.0", "releases")] }),
  m("dm:ship", { author: "you", text: "Approved. Keep an eye on it.", createdAt: at("14:12") }),
  m("dm:ship", { author: "ship", text: "Rolled back. Checkout errors are at zero since 14:15. The bug is in `stripe.checkout.sessions.create`: v1.9.0 dropped the `customer_email` field.", createdAt: at("14:16"), refs: [gh("PR #51 revert", "pull/51")] }),
  m("dm:ship", { author: "ship", text: "The launch branch is green and the preview scores 96 on Lighthouse. PR #48 (pricing-table copy) is waiting on your review.", createdAt: at("16:40"), heldDuringWork: true, level: "tonight", refs: [gh("PR #48", "pull/48")] }),

  m("dm:scout", { author: "scout", text: "Formspark cut nothing; they **raised** Pro to $19 this morning. Three of this week's Tidyform trials came from their comparison page.", createdAt: at("14:02"), heldDuringWork: true, level: "week", refs: [{ label: "formspark.io/pricing", url: "https://formspark.io/pricing" }] }),

  m("group:launch-week", { author: "you", text: "Goal for this week: Tidyform from 107 to 130 paying customers. @scout @ship what's in the way?", createdAt: at("20:10", -1), mentions: ["scout", "ship"] }),
  m("group:launch-week", { author: "scout", text: "Formspark moved Pro to $19. The launch post should lead with our $12 plan.", createdAt: at("14:02"), heldDuringWork: true, level: "week" }),
  m("group:launch-week", { author: "ship", text: "The launch branch is green and the preview build scores 96 on Lighthouse. One open PR, the pricing-table copy, is waiting on your review.", createdAt: at("16:40"), heldDuringWork: true, refs: [gh("PR #48", "pull/48")] }),
  m("group:launch-week", { author: "cos", text: "For tonight: review the pricing PR (20 min), then approve Scout's launch post for Wednesday 20:00.", createdAt: at("18:45"), heldDuringWork: true, level: "tonight", proposalId: "prop_reddit_launch", mentions: ["scout"] }),

  m("group:billing-fixes", { author: "you", text: "Can we stop sending the retry email to people who already wrote in?", createdAt: at("19:32", -1) }),
  m("group:billing-fixes", { author: "revenue", text: "Yes. From now on I check @support's open tickets before any retry email.", createdAt: at("19:33", -1), mentions: ["support"] }),
  m("group:billing-fixes", { author: "support", text: "I'll flag those customers to Revenue as soon as their ticket opens.", createdAt: at("19:40", -1) }),

  m("backroom:failed-cards", { author: "revenue", text: "@support two of today's failed payments are customers with open tickets: Larch Press and Pikku Design. Hold the retry email?", createdAt: at("16:12"), mentions: ["support"] }),
  m("backroom:failed-cards", { author: "support", text: "Yes, hold it. I'll answer their tickets first and send Cipher a draft for tonight.", createdAt: at("16:13") }),
  m("backroom:failed-cards", { author: "revenue", text: "Done. Retry email proposed with a dependency on your reply going out.", createdAt: at("16:14"), proposalId: "prop_card_retry" }),

  m("backroom:checkout-errors", { author: "ship", text: "@revenue checkout errors since 14:04. Do you see failed charges or just failed sessions?", createdAt: at("14:08"), mentions: ["revenue"] }),
  m("backroom:checkout-errors", { author: "revenue", text: "No failed charges. 4 abandoned sessions in 6 minutes, normally 0 or 1. Customers never reach payment.", createdAt: at("14:09") }),
  m("backroom:checkout-errors", { author: "ship", text: "That matches a session-creation failure. Proposing the rollback as urgent.", createdAt: at("14:10") }),
  m("backroom:checkout-errors", { author: "system", text: "Escalated to the founder as urgent (rule: checkout_failing). Approved from phone at 14:12.", createdAt: at("14:12") }),

  m("backroom:formspark-price", { author: "scout", text: "@cos Formspark Pro is now $19. Worth changing this week's plan?", createdAt: at("14:03"), mentions: ["cos"] }),
  m("backroom:formspark-price", { author: "cos", text: "Yes. Make price the lead of the launch post and put pricing-page copy on Monday's list. Don't change our price.", createdAt: at("14:20") }),
];
