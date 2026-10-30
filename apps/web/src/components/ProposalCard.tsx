import { useState } from "react";
import { Link } from "react-router-dom";
import type { Proposal } from "@open-hq/shared";
import { Mark } from "./Mark";
import { Icon } from "./Icon";
import { errorText } from "./States";
import { useDecide, useProposals, useWorkspace } from "../lib/queries";
import { agentName, KIND_LABEL, LEVEL_LABEL, LEVEL_TONE } from "../lib/agents";
import { fmtDayTime, fmtTime } from "../lib/time";

const STATUS: Record<Proposal["status"], { label: string; tone: string }> = {
  pending: { label: "waiting for you", tone: "lamp" }, approved: { label: "approved", tone: "info" },
  executing: { label: "executing", tone: "info" }, done: { label: "done", tone: "ok" },
  failed: { label: "failed", tone: "bad" }, declined: { label: "declined", tone: "line" },
};

export function ProposalStatus({ p }: { p: Proposal }) {
  const s = STATUS[p.status];
  return <span className={`pill ${s.tone}`}>{p.status === "executing" ? <span className="dot live" /> : null}{s.label}</span>;
}

export function ProposalCard({ p, payloadOpen = false, compact = false }: { p: Proposal; payloadOpen?: boolean; compact?: boolean }) {
  const decide = useDecide();
  const [show, setShow] = useState(payloadOpen);
  const all = useProposals().data;
  const products = useWorkspace().data?.products;
  const dep = p.dependsOn ? all?.find((x) => x.id === p.dependsOn) : null;
  const product = products?.find((x) => x.id === p.productId);
  const busy = decide.isPending;
  const run = (decision: "approve" | "decline") => decide.mutate({ id: p.id, body: { decision, payloadHash: p.payloadHash } });

  return (
    <article className={`prop ${p.agent} ${compact ? "compact" : ""} st-${p.status}`} aria-label={`${agentName(p.agent)} proposes: ${p.title}`}>
      <header className="prop-h">
        <Mark id={p.agent} size="sm" />
        <span className="prop-kicker">{agentName(p.agent)} proposes · {KIND_LABEL[p.kind] ?? p.kind}</span>
        <span className="grow" />
        <span className={`pill ${LEVEL_TONE[p.level]}`}>{LEVEL_LABEL[p.level]}</span>
      </header>
      <h3 className="prop-title">{p.title}</h3>
      {!compact ? <p className="prop-why">{p.why}</p> : null}
      <div className="prop-meta">
        {product ? <Link to={`/products/${product.id}`} className="chip"><Icon name="box" />{product.name}</Link> : null}
        <span className="mono tiny muted">proposed {fmtDayTime(p.createdAt)}</span>
        {dep ? (
          <span className={`chip ${dep.status === "done" ? "" : "dep"}`}><Icon name="link" />{dep.status === "done" ? "after" : "runs after"}: {dep.title.length > 42 ? `${dep.title.slice(0, 42)}…` : dep.title}</span>
        ) : null}
      </div>
      <button type="button" className="prop-toggle" onClick={() => setShow((v) => !v)} aria-expanded={show}>
        <Icon name={show ? "down" : "chev"} />
        {show ? "Hide" : "Show"} the exact action that will run
      </button>
      {show ? (
        <div className="payload">
          <div className="payload-h"><span className="eyebrow">Payload · executes exactly as shown</span><span className="mono tiny muted" title={p.payloadHash}>sha256 {p.payloadHash.slice(0, 12)}…</span></div>
          <pre>{JSON.stringify(p.payload, null, 2)}</pre>
        </div>
      ) : null}
      {p.status === "pending" ? (
        <div className="prop-actions">
          <button className="btn primary sm" disabled={busy} onClick={() => run("approve")}>
            {busy && decide.variables?.body.decision === "approve" ? <span className="spin" /> : <Icon name="check" />}Approve
          </button>
          <button className="btn sm" disabled={busy} onClick={() => run("decline")}>
            {busy && decide.variables?.body.decision === "decline" ? <span className="spin" /> : null}Decline
          </button>
          {decide.isError ? <span className="prop-err" role="alert">{errorText(decide.error)}</span> : null}
        </div>
      ) : (
        <div className="prop-result">
          <ProposalStatus p={p} />
          {p.decidedAt ? <span className="mono tiny muted">{p.status === "declined" ? "declined" : "approved"} {fmtTime(p.decidedAt)}</span> : null}
          {p.result ? (
            <span className={`small ${p.result.ok ? "dim" : "bad-text"}`}>
              {p.result.detail}
              {p.result.url ? <> · <a href={p.result.url} target="_blank" rel="noreferrer">open<Icon name="ext" className="ico-inline" /></a></> : null}
            </span>
          ) : p.status === "executing" || p.status === "approved" ? <span className="small muted">The app is running it now…</span> : null}
        </div>
      )}
    </article>
  );
}
