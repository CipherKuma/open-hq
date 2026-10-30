import type { Product } from "@open-hq/shared";

export interface DemoProduct extends Product {
  priceCents: number; // monthly price; identifies the product's subscriptions in the shared Stripe sandbox
  github: boolean; // has a real GitHub repo / Sentry project / support inbox
}

export const PRODUCTS: Record<string, DemoProduct> = {
  tidyform: { id: "tidyform", name: "Tidyform", url: "https://openhq-tidyform.workers.dev", tagline: "Form backend for indie sites", priceCents: 1200, github: true },
  quillbill: { id: "quillbill", name: "Quillbill", url: "https://quillbill.pages.dev", tagline: "Invoicing for freelance translators", priceCents: 2900, github: false },
};
