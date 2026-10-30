import type { LiveHub } from "./live";

export interface Env {
  DB: D1Database;
  RUNS: R2Bucket;
  LIVE: DurableObjectNamespace<LiveHub>;
  WORKDAY: Workflow;
  AGENT_RUN: Workflow;
  NEBIUS_API_KEY: string;
  MCP_TOKEN: string;
  INGEST_SECRET: string;
  COMPOSIO_API_KEY?: string;
  HERMES_URL?: string;
  HERMES_KEY?: string;
  AGENT_RUNTIME?: string; // "hermes" | "loop" (default loop)
  CRON_ENABLED?: string; // "0" disables cron-driven shifts
}
