import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { AgentId, Channel, Handover, Proposal } from "@open-hq/shared";
import { api, type DecisionBody } from "../api";

export const qk = {
  workspace: ["workspace"] as const,
  handover: ["handover"] as const,
  channels: ["channels"] as const,
  messages: (id: string) => ["messages", id] as const,
  proposals: ["proposals"] as const,
  dashboard: (id: string) => ["dashboard", id] as const,
  agent: (id: string) => ["agent", id] as const,
  schedule: ["schedule"] as const,
  connections: ["connections"] as const,
  activity: (agent: string) => ["activity", agent] as const,
};

export const useWorkspace = () => useQuery({ queryKey: qk.workspace, queryFn: api.workspace });
export const useHandover = () => useQuery({ queryKey: qk.handover, queryFn: () => api.handover() });
export const useChannels = () => useQuery({ queryKey: qk.channels, queryFn: api.channels });
export const useMessages = (id: string) => useQuery({ queryKey: qk.messages(id), queryFn: () => api.messages(id), enabled: !!id });
export const useProposals = () => useQuery({ queryKey: qk.proposals, queryFn: () => api.proposals() });
export const useDashboard = (id: string) => useQuery({ queryKey: qk.dashboard(id), queryFn: () => api.dashboard(id), enabled: !!id });
export const useAgent = (id: AgentId) => useQuery({ queryKey: qk.agent(id), queryFn: () => api.agent(id) });
export const useSchedule = () => useQuery({ queryKey: qk.schedule, queryFn: api.schedule });
export const useConnections = () => useQuery({ queryKey: qk.connections, queryFn: api.connections });
export const useActivity = (agent: string) =>
  useQuery({ queryKey: qk.activity(agent), queryFn: () => api.activity({ agent: agent === "all" ? undefined : agent, limit: 200 }) });

export function upsertProposal(qc: QueryClient, p: Proposal) {
  qc.setQueryData<Proposal[]>(qk.proposals, (old) => {
    if (!old) return old;
    const i = old.findIndex((x) => x.id === p.id);
    if (i < 0) return [p, ...old];
    const next = old.slice();
    next[i] = p;
    return next;
  });
  qc.setQueryData<Handover>(qk.handover, (h) => (h ? { ...h, decisions: h.decisions.map((d) => (d.id === p.id ? p : d)) } : h));
}

export function useDecide() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: DecisionBody }) => api.decide(id, body),
    onSuccess: (p) => upsertProposal(qc, p),
    onError: (err: unknown) => {
      const code = (err as { code?: string }).code;
      if (code === "hash_mismatch" || code === "not_pending") void qc.invalidateQueries({ queryKey: qk.proposals });
    },
  });
}

export function markRead(qc: QueryClient, channelId: string) {
  qc.setQueryData<Channel[]>(qk.channels, (old) => old?.map((c) => (c.id === channelId ? { ...c, unread: 0 } : c)));
}
