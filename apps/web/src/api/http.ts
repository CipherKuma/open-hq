import { z } from "zod";
import {
  ActivityEntry, AgentProfile, ApiError, Channel, Connection, Dashboard, Handover,
  Message, Proposal, Schedule, Workspace,
} from "@open-hq/shared";
import { ApiRequestError, type Api } from "./types";
import { connectLiveSocket } from "./live";

async function request<S extends z.ZodTypeAny>(schema: S, path: string, init?: RequestInit): Promise<z.infer<S>> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: { Accept: "application/json", ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers },
    });
  } catch {
    throw new ApiRequestError("Can't reach Open HQ. Check your connection and try again.", "network");
  }
  let body: unknown = null;
  try { body = await res.json(); } catch { body = null; }
  if (!res.ok) {
    const err = ApiError.safeParse(body);
    throw new ApiRequestError(err.success ? err.data.error : res.status >= 500 ? `Open HQ's server had a problem (${res.status}). Try again in a moment.` : `Request failed (${res.status})`, err.success ? err.data.code : undefined, res.status);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new ApiRequestError("The server sent data this screen doesn't understand.", "bad_shape", res.status);
  return parsed.data;
}

const json = (method: string, data: unknown): RequestInit => ({ method, body: JSON.stringify(data) });
const enc = encodeURIComponent;

export const httpApi: Api = {
  mode: "live",
  workspace: () => request(Workspace, "/api/workspace"),
  handover: (regenerate) => request(Handover, `/api/handover${regenerate ? "?regenerate=1" : ""}`),
  channels: () => request(z.array(Channel), "/api/channels"),
  messages: (id, before) => request(z.array(Message), `/api/channels/${enc(id)}/messages${before ? `?before=${enc(before)}` : ""}`),
  postMessage: (id, text) => request(Message, `/api/channels/${enc(id)}/messages`, json("POST", { text })),
  createGroup: (name, agents) => request(Channel, "/api/groups", json("POST", { name, agents })),
  proposals: (status) => request(z.array(Proposal), `/api/proposals${status ? `?status=${status}` : ""}`),
  decide: (id, body) => request(Proposal, `/api/proposals/${enc(id)}/decision`, json("POST", body)),
  dashboard: (id) => request(Dashboard, `/api/products/${enc(id)}/dashboard`),
  agent: (id) => request(AgentProfile, `/api/agents/${enc(id)}`),
  schedule: () => request(Schedule, "/api/schedule"),
  putSchedule: (s) => request(Schedule, "/api/schedule", json("PUT", s)),
  connections: () => request(z.array(Connection), "/api/connections"),
  link: (toolkit) => request(z.object({ redirectUrl: z.string() }), `/api/connections/${enc(toolkit)}/link`, { method: "POST" }),
  activity: (q) => {
    const p = new URLSearchParams();
    if (q?.agent) p.set("agent", q.agent);
    if (q?.limit) p.set("limit", String(q.limit));
    const qs = p.toString();
    return request(z.array(ActivityEntry), `/api/activity${qs ? `?${qs}` : ""}`);
  },
  runWorkday: () => request(z.object({ runId: z.string() }), "/api/demo/workday", { method: "POST" }),
  connectLive: connectLiveSocket,
};
