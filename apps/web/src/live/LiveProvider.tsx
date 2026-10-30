import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { ActivityEntry, AgentId, Channel, LiveEvent, Message, Workspace } from "@open-hq/shared";
import { api, type LiveState } from "../api";
import { qk, upsertProposal, useWorkspace } from "../lib/queries";

type Status = "idle" | "working" | "waiting";
type Ctx = {
  state: LiveState;
  status: Partial<Record<AgentId, Status>>;
  subscribe: (fn: (e: LiveEvent) => void) => () => void;
  setOpenChannel: (id: string | null) => void;
};
const LiveCtx = createContext<Ctx | null>(null);

export function LiveProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [state, setState] = useState<LiveState>("connecting");
  const [status, setStatus] = useState<Partial<Record<AgentId, Status>>>({});
  const subs = useRef(new Set<(e: LiveEvent) => void>());
  const openChannel = useRef<string | null>(null);

  const apply = useCallback((e: LiveEvent) => {
    if (e.type === "message") {
      const m = e.data;
      let known = false;
      qc.setQueryData<Message[]>(qk.messages(m.channelId), (old) => {
        if (!old) return old;
        if (old.some((x) => x.id === m.id)) return old;
        const tmp = old.findIndex((x) => x.id.startsWith("tmp_") && x.author === m.author && x.text === m.text);
        if (tmp >= 0) { const next = old.slice(); next[tmp] = m; return next; }
        return [...old, m];
      });
      qc.setQueryData<Channel[]>(qk.channels, (old) => old?.map((c) => {
        if (c.id !== m.channelId) return c;
        known = true;
        const bump = m.author !== "you" && openChannel.current !== c.id ? 1 : 0;
        return { ...c, lastAt: m.createdAt, unread: c.unread + bump };
      }));
      if (!known) void qc.invalidateQueries({ queryKey: qk.channels });
    } else if (e.type === "proposal") {
      upsertProposal(qc, e.data);
    } else if (e.type === "activity") {
      const row: ActivityEntry = e.data;
      for (const [key, rows] of qc.getQueriesData<ActivityEntry[]>({ queryKey: ["activity"] })) {
        const filter = key[1];
        if (!rows || (filter !== "all" && filter !== row.agent) || rows.some((r) => r.id === row.id)) continue;
        qc.setQueryData(key, [row, ...rows]);
      }
    } else if (e.type === "agent_status") {
      const { id, status: s } = e.data;
      setStatus((prev) => ({ ...prev, [id]: s }));
      qc.setQueryData<Workspace>(qk.workspace, (w) => w && { ...w, agents: w.agents.map((a) => (a.id === id ? { ...a, status: s, lastRunAt: s === "working" ? new Date().toISOString() : a.lastRunAt } : a)) });
    } else if (e.type === "handover") {
      qc.setQueryData(qk.handover, e.data);
    }
    subs.current.forEach((fn) => fn(e));
  }, [qc]);

  useEffect(() => {
    let wasClosed = false;
    return api.connectLive(apply, (s) => {
      setState(s);
      if (s === "closed") wasClosed = true;
      // After a reconnect, anything missed while offline is refetched rather than guessed.
      if (s === "open" && wasClosed) { wasClosed = false; void qc.invalidateQueries(); }
    });
  }, [apply, qc]);

  const value = useMemo<Ctx>(() => ({
    state,
    status,
    subscribe: (fn) => { subs.current.add(fn); return () => { subs.current.delete(fn); }; },
    setOpenChannel: (id) => { openChannel.current = id; },
  }), [state, status]);

  return <LiveCtx.Provider value={value}>{children}</LiveCtx.Provider>;
}

export function useLive() {
  const v = useContext(LiveCtx);
  if (!v) throw new Error("useLive outside LiveProvider");
  return v;
}

// Live status wins over the workspace snapshot once an agent_status event has arrived.
export function useAgentStatus(): (id: AgentId) => Status {
  const { status } = useLive();
  const ws = useWorkspace().data;
  return (id) => status[id] ?? ws?.agents.find((a) => a.id === id)?.status ?? "idle";
}
