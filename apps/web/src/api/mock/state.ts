import { z } from "zod";
import {
  ActivityEntry, AgentProfile, Channel, Connection, Dashboard, Handover, LiveEvent, Message, Proposal, Workspace,
} from "@open-hq/shared";
import type { LiveState } from "../types";
import { channels, handover, proposals, workspace } from "./core";
import { messageSeed } from "./messages";
import { agentProfiles, dashboards } from "./world";
import { activitySeed, connections } from "./catalog";

// Fixtures go through the same zod schemas as live responses, so a fixture drift fails loudly in dev.
const check = <S extends z.ZodTypeAny>(schema: S, value: unknown, label: string): z.infer<S> => {
  const r = schema.safeParse(value);
  if (!r.success) throw new Error(`Fixture ${label} does not match the contract: ${r.error.issues[0]?.path.join(".")} ${r.error.issues[0]?.message}`);
  return r.data;
};

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

export const db = {
  workspace: check(Workspace, clone(workspace), "workspace"),
  channels: check(z.array(Channel), clone(channels), "channels"),
  messages: check(z.array(Message), clone(messageSeed), "messages"),
  proposals: check(z.array(Proposal), clone(proposals), "proposals"),
  handover: check(Handover, handover(), "handover"),
  dashboards: check(z.record(Dashboard), clone(dashboards), "dashboards"),
  agents: check(z.record(AgentProfile), clone(agentProfiles), "agents"),
  connections: check(z.array(Connection), clone(connections), "connections"),
  activity: check(z.array(ActivityEntry), clone(activitySeed), "activity"),
};

type Listener = (e: LiveEvent) => void;
const listeners = new Set<Listener>();
export const emit = (e: LiveEvent) => {
  applyLocal(e);
  listeners.forEach((l) => l(e));
};
export const subscribe = (l: Listener, onState: (s: LiveState) => void) => {
  listeners.add(l);
  onState("connecting");
  const t = setTimeout(() => onState("open"), 300);
  return () => { clearTimeout(t); listeners.delete(l); };
};

function applyLocal(e: LiveEvent) {
  if (e.type === "message") {
    if (!db.messages.some((m) => m.id === e.data.id)) db.messages.push(e.data);
    const ch = db.channels.find((c) => c.id === e.data.channelId);
    if (ch) ch.lastAt = e.data.createdAt;
  } else if (e.type === "proposal") {
    const i = db.proposals.findIndex((p) => p.id === e.data.id);
    if (i >= 0) db.proposals[i] = e.data; else db.proposals.unshift(e.data);
    db.handover.decisions = db.handover.decisions.map((p) => (p.id === e.data.id ? e.data : p));
  } else if (e.type === "activity") {
    db.activity.unshift(e.data);
  } else if (e.type === "agent_status") {
    const a = db.workspace.agents.find((x) => x.id === e.data.id);
    if (a) { a.status = e.data.status; if (e.data.status === "working") a.lastRunAt = new Date().toISOString(); }
  } else if (e.type === "handover") {
    db.handover = e.data;
  }
}
