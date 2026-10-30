import type {
  ActivityEntry, AgentId, AgentProfile, Channel, Connection, Dashboard, Handover,
  LiveEvent, Message, Proposal, Schedule, Workspace,
} from "@open-hq/shared";

export type LiveState = "connecting" | "open" | "closed";
export type DecisionBody = { decision: "approve" | "decline"; payloadHash: string };

// One interface, two adapters: the live HTTP/WebSocket client and the dev-only fixture world.
export interface Api {
  mode: "live" | "mock";
  workspace(): Promise<Workspace>;
  handover(regenerate?: boolean): Promise<Handover>;
  channels(): Promise<Channel[]>;
  messages(channelId: string, before?: string): Promise<Message[]>;
  postMessage(channelId: string, text: string): Promise<Message>;
  createGroup(name: string, agents: AgentId[]): Promise<Channel>;
  proposals(status?: Proposal["status"]): Promise<Proposal[]>;
  decide(id: string, body: DecisionBody): Promise<Proposal>;
  dashboard(productId: string): Promise<Dashboard>;
  agent(id: AgentId): Promise<AgentProfile>;
  schedule(): Promise<Schedule>;
  putSchedule(s: Schedule): Promise<Schedule>;
  connections(): Promise<Connection[]>;
  link(toolkit: string): Promise<{ redirectUrl: string }>;
  activity(q?: { agent?: string; limit?: number }): Promise<ActivityEntry[]>;
  runWorkday(): Promise<{ runId: string }>;
  connectLive(onEvent: (e: LiveEvent) => void, onState: (s: LiveState) => void): () => void;
}

export class ApiRequestError extends Error {
  constructor(message: string, public code?: string, public status?: number) {
    super(message);
    this.name = "ApiRequestError";
  }
}
