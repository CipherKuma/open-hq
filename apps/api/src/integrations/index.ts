// Integrations module contract (Composio + direct adapters). The integrations agent owns this folder
// and replaces these stubs; signatures are fixed by docs/BRIEF.md.
import type { AgentId, Connection, Dashboard, Proposal } from "@open-hq/shared";

export interface OpenAITool {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}
export interface NormalizedEvent {
  source: string; // "github" | "stripe" | "gmail" | "sentry" | ...
  type: string; // e.g. "github.push", "gmail.new_message"
  productId: string | null;
  agent: AgentId; // who should react
  summary: string;
  raw: unknown;
  at: string;
}
export interface ExecResult { ok: boolean; detail: string; url: string | null }

const notReady = (what: string): never => {
  throw new Error(`integrations.${what} not implemented yet`);
};

export async function readToolsFor(_agent: AgentId, _env: unknown): Promise<OpenAITool[]> { return []; }
export async function callReadTool(_agent: AgentId, name: string, _args: unknown, _env: unknown): Promise<unknown> { return notReady(`callReadTool(${name})`); }
export async function execute(_p: Proposal, _env: unknown): Promise<ExecResult> { return notReady("execute"); }
export async function listConnections(_env: unknown): Promise<Connection[]> { return []; }
export async function linkConnection(toolkit: string, _env: unknown): Promise<{ redirectUrl: string }> { return notReady(`linkConnection(${toolkit})`); }
export async function verifyComposioWebhook(_req: Request, _env: unknown): Promise<NormalizedEvent | null> { return null; }
export async function dashboardData(productId: string, _env: unknown): Promise<Dashboard> { return notReady(`dashboardData(${productId})`); }
export async function hermesMcpConfig(_agent: AgentId, _env: unknown): Promise<{ url: string; headers: Record<string, string> }> { return notReady("hermesMcpConfig"); }
