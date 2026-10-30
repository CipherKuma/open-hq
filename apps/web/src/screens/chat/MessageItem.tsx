import type { Message } from "@open-hq/shared";
import { Mark } from "../../components/Mark";
import { Icon } from "../../components/Icon";
import { RichText } from "../../components/RichText";
import { ProposalCard } from "../../components/ProposalCard";
import { useProposals } from "../../lib/queries";
import { agentName, LEVEL_LABEL, LEVEL_TONE } from "../../lib/agents";
import { fmtTime } from "../../lib/time";

export type UiMessage = Message & { pending?: boolean; failed?: boolean };

function InlineProposal({ id }: { id: string }) {
  const q = useProposals();
  const p = q.data?.find((x) => x.id === id);
  if (q.isPending) return <div className="skel" style={{ height: 96, marginTop: 6 }} aria-hidden="true" />;
  if (!p) return <div className="notice small" style={{ marginTop: 6 }}><Icon name="alert" />The proposal attached here is no longer available.</div>;
  return <ProposalCard p={p} compact />;
}

export function MessageItem({ m, onRetry }: { m: UiMessage; onRetry?: (m: UiMessage) => void }) {
  const system = m.author === "system";
  return (
    <li className={`msg ${m.author} ${m.pending ? "pending" : ""} ${m.failed ? "failed" : ""} ${system ? "sys" : ""}`}>
      {system ? <Icon name="lock" className="ico msg-sys-ico" /> : <Mark id={m.author} />}
      <div className="msg-body">
        <div className="msg-meta">
          <b>{agentName(m.author)}</b>
          <time dateTime={m.createdAt}>{fmtTime(m.createdAt)}</time>
          {m.level ? <span className={`pill ${LEVEL_TONE[m.level]}`}>{LEVEL_LABEL[m.level]}</span> : null}
          {m.pending ? <span className="mono tiny muted">sending…</span> : null}
        </div>
        <RichText text={m.text} />
        {m.refs.length ? (
          <div className="chips msg-refs">
            {m.refs.map((r) => <a key={r.url + r.label} className="chip" href={r.url} target="_blank" rel="noreferrer"><Icon name="link" />{r.label}</a>)}
          </div>
        ) : null}
        {m.proposalId ? <InlineProposal id={m.proposalId} /> : null}
        {m.failed ? (
          <div className="msg-fail" role="alert">
            <Icon name="alert" />Not sent.
            {onRetry ? <button className="btn ghost sm" onClick={() => onRetry(m)}>Retry</button> : null}
          </div>
        ) : null}
      </div>
    </li>
  );
}
