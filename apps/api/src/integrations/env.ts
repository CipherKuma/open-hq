// Environment the integrations module reads. All optional except the Composio key; callers pass the Worker env.
export interface IntegrationsEnv {
  COMPOSIO_API_KEY: string;
  COMPOSIO_USER_ID?: string; // default "openhq-demo"
  COMPOSIO_WEBHOOK_SECRET?: string; // webhook subscription signing secret
  PUBLIC_URL?: string; // default https://openhq.pages.dev
  DEMO_GITHUB_OWNER?: string; // default CipherKuma
  DEMO_GITHUB_REPO?: string; // default tidyform
  DEMO_SENTRY_ORG?: string; // discovered when unset
  DEMO_SENTRY_PROJECT?: string; // default tidyform
  CLOUDFLARE_API_TOKEN?: string; // Workers Scripts:Edit, for deploy_rollback and deploy history
  CLOUDFLARE_ACCOUNT_ID?: string;
  TIDYFORM_PAGES_PROJECT?: string; // default tidyform
}

export const asEnv = (env: unknown): IntegrationsEnv => {
  const e = env as Partial<IntegrationsEnv> | null | undefined;
  if (!e || typeof e.COMPOSIO_API_KEY !== "string" || !e.COMPOSIO_API_KEY) {
    throw new IntegrationError("COMPOSIO_API_KEY is not configured", "not_configured");
  }
  return e as IntegrationsEnv;
};

export const userId = (env: IntegrationsEnv) => env.COMPOSIO_USER_ID || "openhq-demo";
export const demoRepo = (env: IntegrationsEnv) => ({
  owner: env.DEMO_GITHUB_OWNER || "CipherKuma",
  repo: env.DEMO_GITHUB_REPO || "tidyform",
});
export const tidyformProject = (env: IntegrationsEnv) => env.TIDYFORM_PAGES_PROJECT || "tidyform";

export class IntegrationError extends Error {
  constructor(message: string, readonly code: string = "integration_error") {
    super(message);
    this.name = "IntegrationError";
  }
}
