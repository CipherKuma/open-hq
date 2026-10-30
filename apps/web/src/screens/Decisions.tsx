import { useMemo, useState } from "react";
import type { Proposal } from "@open-hq/shared";
import { useProposals, useWorkspace } from "../lib/queries";
import { ProposalCard } from "../components/ProposalCard";
import { Mark } from "../components/Mark";
import { Empty, ErrorState, Skeleton } from "../components/States";
import { AGENT_ORDER, agentName } from "../lib/agents";

type StatusFilter = "pending" | "done" | "declined" | "all";
const STATUS_OPTS: { id: StatusFilter; label: string; match: (p: Proposal) => boolean }[] = [
  { id: "pending", label: "Waiting", match: (p) => p.status === "pending" },
  { id: "done", label: "Executed", match: (p) => ["approved", "executing", "done", "failed"].includes(p.status) },
  { id: "declined", label: "Declined", match: (p) => p.status === "declined" },
  { id: "all", label: "All", match: () => true },
];
const LEVEL_RANK = { urgent: 0, tonight: 1, week: 2 } as const;

export function Decisions() {
  const q = useProposals();
  const products = useWorkspace().data?.products ?? [];
  const [status, setStatus] = useState<StatusFilter>("pending");
  const [agent, setAgent] = useState<string>("all");
  const [product, setProduct] = useState<string>("all");

  const rows = useMemo(() => {
    const opt = STATUS_OPTS.find((s) => s.id === status)!;
    return (q.data ?? [])
      .filter(opt.match)
      .filter((p) => agent === "all" || p.agent === agent)
      .filter((p) => product === "all" || (product === "none" ? !p.productId : p.productId === product))
      .sort((a, b) => (status === "pending" ? LEVEL_RANK[a.level] - LEVEL_RANK[b.level] : 0) || b.createdAt.localeCompare(a.createdAt));
  }, [q.data, status, agent, product]);

  const countFor = (s: StatusFilter) => (q.data ?? []).filter(STATUS_OPTS.find((x) => x.id === s)!.match).length;

  return (
    <div className="page narrow">
      <div className="page-h">
        <div>
          <span className="eyebrow lamp">Approval queue</span>
          <h1>Decisions</h1>
          <p className="lede">Agents can only read. Every change they want goes here first, with the exact action shown. The app runs it only if it matches what you approved.</p>
        </div>
      </div>
      <div className="filters">
        <div className="seg" role="group" aria-label="Status">
          {STATUS_OPTS.map((s) => (
            <button key={s.id} aria-pressed={status === s.id} onClick={() => setStatus(s.id)}>{s.label}<span className="mono tiny muted">{q.data ? countFor(s.id) : ""}</span></button>
          ))}
        </div>
        <div className="seg" role="group" aria-label="Agent">
          <button aria-pressed={agent === "all"} onClick={() => setAgent("all")}>Everyone</button>
          {AGENT_ORDER.map((a) => (
            <button key={a} aria-pressed={agent === a} onClick={() => setAgent(a)} aria-label={agentName(a)} title={agentName(a)}><Mark id={a} size="xs" /></button>
          ))}
        </div>
        <label className="field inline-field">
          <span className="sr-only">Product</span>
          <select className="select" value={product} onChange={(e) => setProduct(e.target.value)}>
            <option value="all">All products</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            <option value="none">Not product-specific</option>
          </select>
        </label>
      </div>
      {q.isPending ? (
        <div className="stack" role="status" aria-label="Loading decisions">{[0, 1, 2].map((i) => <Skeleton key={i} h={150} r={12} />)}</div>
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} title="Couldn't load decisions" />
      ) : rows.length === 0 ? (
        <Empty title={status === "pending" ? "Nothing waiting for you" : "No decisions match"} icon="check">
          {status === "pending" ? "When an agent wants to change something, it lands here with the exact action it will run." : "Try another status, agent or product."}
        </Empty>
      ) : (
        <div className="stack">{rows.map((p) => <ProposalCard key={p.id} p={p} payloadOpen={p.status === "pending"} />)}</div>
      )}
    </div>
  );
}
