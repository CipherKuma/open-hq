// Integrations module (Composio + direct adapters). Signatures are fixed by docs/BRIEF.md.
export type { ExecResult, NormalizedEvent, OpenAITool } from "./types";
export { readToolsFor, callReadTool } from "./read";
export { execute } from "./execute";
export { listConnections, linkConnection } from "./connections";
export { verifyComposioWebhook, WebhookAuthError } from "./webhooks";
export { dashboardData } from "./dashboard";
export { hermesMcpConfig } from "./mcp";
export { IntegrationError } from "./env";
