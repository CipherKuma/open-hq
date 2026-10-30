import { Link } from "react-router-dom";
import type { AgentId, AgentProfile } from "@open-hq/shared";
import { useAgent } from "../lib/queries";
import { useAgentStatus } from "../live/LiveProvider";
import { Icon } from "../components/Icon";
import { Mark } from "../components/Mark";
import { ErrorState, Skeleton } from "../components/States";
import { cronText } from "../lib/cron";
import { ago, fmtDay } from "../lib/time";

function Spend({ s }: { s: AgentProfile["spendToday"] }) {
  const pct = s.budgetUsd > 0 ? (s.usd / s.budgetUsd) * 100 : 0;
  return (
    <section className="card">
      <div className="card-h"><h2>Spend today</h2><span className="mono small num">${s.usd.toFixed(2)} <span className="muted">of ${s.budgetUsd.toFixed(2)}</span></span></div>
      <div className="spend-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label="Share of today's budget used">
        <i className={pct >= 100 ? "over" : pct >= 75 ? "hi" : ""} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <p className="small muted">{s.tokens.toLocaleString("en-US")} tokens on Nebius Token Factory. When the budget runs out the agent stops and the Chief of Staff tells you.</p>
    </section>
  );
}

function Profile({ a }: { a: AgentProfile }) {
  const statusOf = useAgentStatus();
  const st = statusOf(a.id as AgentId);
  return (
    <>
      <div className="agent-hero">
        <Mark id={a.id} size="lg" status={st} />
        <div className="grow">
          <span className="eyebrow lamp">Agent</span>
          <h1>{a.name}</h1>
          <p className="dim">{a.job}</p>
        </div>
        <Link to={`/chat/${encodeURIComponent(`dm:${a.id}`)}`} className="btn primary"><Icon name="chat" />Message</Link>
      </div>
      <div className="row wrap">
        <span className="pill line mono">{a.model}</span>
        <span className={`pill ${a.runtime === "hermes" ? "info" : "lamp"}`} title="Runtime that served the last run">runtime · {a.runtime}</span>
        <span className={`pill ${st === "working" ? "lamp" : "line"}`}>{st === "working" ? <span className="dot live" /> : null}{st}</span>
        <span className="mono tiny muted">last run {ago(a.lastRunAt)}</span>
      </div>
      <div className="grid2">
        <section className="card">
          <div className="card-h"><h2>Role and voice</h2><span className="mono tiny muted">SOUL.md</span></div>
          <p className="soul">{a.soul}</p>
        </section>
        <div className="stack">
          <Spend s={a.spendToday} />
          <section className="card">
            <h2>Schedule</h2>
            {a.schedule.length === 0 ? <p className="small muted">Runs only when messaged.</p> : (
              <ul className="list-rows">
                {a.schedule.map((s) => <li key={s.cron + s.task} className="tool-row"><span className="mono small" style={{ minWidth: 120 }}>{cronText(s.cron)}</span><span className="dim">{s.task}</span></li>)}
              </ul>
            )}
          </section>
        </div>
      </div>
      <section className="card">
        <div className="card-h"><h2>Tools</h2><span className="small muted">Read tools run on their own. Propose tools only create a decision for you.</span></div>
        {a.tools.length === 0 ? <p className="small muted">No tools connected yet.</p> : (
          <ul className="list-rows">
            {a.tools.map((t) => (
              <li key={t.name} className="tool-row">
                <span className={`pill ${t.access === "read" ? "line" : "lamp"}`} style={{ minWidth: 64, justifyContent: "center" }}>{t.access}</span>
                <code className="grow ellipsis">{t.name}</code>
                <span className="mono tiny muted">{t.toolkit}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <div className="grid2">
        <section className="card">
          <div className="card-h"><h2>Memory</h2><span className="mono tiny muted">{a.memory.length}</span></div>
          {a.memory.length === 0 ? <p className="small muted">Nothing remembered yet. Memories are proposed and only kept once you approve them.</p> : (
            <ul className="list-rows">
              {a.memory.map((m) => <li key={m.id}><span>{m.text}</span><span className="mono tiny muted">{m.source} · {fmtDay(m.createdAt)}</span></li>)}
            </ul>
          )}
        </section>
        <section className="card">
          <div className="card-h"><h2>Standing orders</h2><span className="mono tiny muted">{a.standingOrders.length}</span></div>
          {a.standingOrders.length === 0 ? <p className="small muted">No standing orders. Tell the agent in chat, and it will propose one.</p> : (
            <ul className="list-rows">{a.standingOrders.map((s) => <li key={s.id}>{s.text}</li>)}</ul>
          )}
        </section>
      </div>
    </>
  );
}

export function AgentScreen({ id }: { id: AgentId }) {
  const q = useAgent(id);
  return (
    <div className="page">
      {q.isPending ? (
        <div className="stack loose" role="status" aria-label="Loading agent"><Skeleton h={52} w="50%" /><div className="grid2"><Skeleton h={220} /><Skeleton h={220} /></div><Skeleton h={180} /></div>
      ) : q.isError ? <ErrorState error={q.error} onRetry={() => void q.refetch()} title="Couldn't load this agent" /> : <Profile a={q.data} />}
    </div>
  );
}
