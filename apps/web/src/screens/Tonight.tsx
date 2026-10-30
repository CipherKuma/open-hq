import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Handover } from "@open-hq/shared";
import { api } from "../api";
import { useHandover, qk } from "../lib/queries";
import { Icon } from "../components/Icon";
import { Mark } from "../components/Mark";
import { ProposalCard } from "../components/ProposalCard";
import { Empty, ErrorState, Skeleton, errorText } from "../components/States";
import { agentName } from "../lib/agents";
import { fmtDate, fmtMinutes, fmtTime } from "../lib/time";
import { TodoPanel } from "./tonight/TodoPanel";
import { WorkdayButton, WorkdayPanel, useWorkdayRun } from "./tonight/WorkdayRun";

const STATUS = {
  normal: { tone: "ok", label: "All systems normal" },
  attention: { tone: "lamp", label: "A few things need you" },
  urgent: { tone: "bad", label: "Something is urgent" },
} as const;

function TonightSkeleton() {
  return (
    <div className="stack loose" role="status" aria-label="Loading tonight's handover">
      <Skeleton h={34} w="45%" />
      <Skeleton h={120} />
      <div className="ho-grid"><Skeleton h={260} /><Skeleton h={260} /></div>
    </div>
  );
}

function Since({ h }: { h: Handover }) {
  return (
    <section className="card since" aria-labelledby="since-h">
      <div className="card-h">
        <h2 id="since-h">Since 09:00</h2>
        <span className="mono tiny muted">written {fmtTime(h.generatedAt)} by Chief of Staff · {h.model}</span>
      </div>
      {h.since.length === 0 ? <p className="small muted">A quiet day. No agent reported anything worth your evening.</p> : (
        <ul className="since-list">
          {h.since.map((s, i) => (
            <li key={`${s.agent}-${i}`}>
              <Link to={`/chat/${encodeURIComponent(`dm:${s.agent}`)}`} className="since-who" aria-label={`Open chat with ${agentName(s.agent)}`}><Mark id={s.agent} size="sm" /></Link>
              <div><span className="since-name">{agentName(s.agent)}</span><p>{s.text}</p></div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function Tonight() {
  const q = useHandover();
  const qc = useQueryClient();
  const w = useWorkdayRun();
  const regen = useMutation({ mutationFn: () => api.handover(true), onSuccess: (h) => qc.setQueryData(qk.handover, h) });
  const running = w.starting || w.run?.phase === "running";

  const actions = (
    <div className="row wrap">
      <button className="btn" onClick={() => regen.mutate()} disabled={regen.isPending || running}>
        {regen.isPending ? <span className="spin" /> : <Icon name="refresh" />}Rewrite handover
      </button>
      <WorkdayButton onStart={w.start} disabled={running} />
    </div>
  );

  if (q.isPending) return <div className="page"><TonightSkeleton /></div>;
  if (q.isError) {
    const notYet = (q.error as { status?: number }).status === 404;
    return (
      <div className="page">
        <div className="page-h"><div><span className="eyebrow lamp">Evening handover</span><h1>Tonight</h1></div>{actions}</div>
        <WorkdayPanel w={w} />
        {notYet ? (
          <Empty title="No handover yet today" icon="lamp">The Chief of Staff writes it 15 minutes before your founder hours. Run a workday now to see one immediately.</Empty>
        ) : <ErrorState error={q.error} onRetry={() => void q.refetch()} title="Couldn't load tonight's handover" />}
      </div>
    );
  }

  const h = q.data;
  const st = STATUS[h.status];
  const pending = h.decisions.filter((d) => d.status === "pending").length;
  return (
    <div className="page tonight">
      <div className="page-h">
        <div>
          <span className="eyebrow lamp">{fmtDate(h.date)} · evening handover</span>
          <h1>Tonight</h1>
          <div className="row wrap ho-facts">
            <span className="mono small">{h.window.start}–{h.window.end} · {fmtMinutes(h.window.minutes)}</span>
            <span className={`pill ${st.tone}`}><span className="dot" />{st.label}</span>
          </div>
        </div>
        {actions}
      </div>
      {regen.isError ? <div className="notice bad" role="alert"><Icon name="alert" />{errorText(regen.error)}</div> : null}
      <WorkdayPanel w={w} />
      <Since h={h} />
      <div className="ho-grid">
        <section className="stack" aria-labelledby="dec-h">
          <div className="card-h">
            <h2 id="dec-h">Decisions <span className="muted num">· {pending}</span></h2>
            <Link to="/decisions" className="btn ghost sm">All decisions<Icon name="chev" /></Link>
          </div>
          {h.decisions.length === 0 ? (
            <Empty compact title="Nothing to decide" icon="check">Every agent's proposals are handled. Enjoy the quiet.</Empty>
          ) : h.decisions.map((p) => <ProposalCard key={p.id} p={p} compact />)}
        </section>
        <TodoPanel key={h.generatedAt} h={h} />
      </div>
    </div>
  );
}
