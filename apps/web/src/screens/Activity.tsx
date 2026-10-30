import { useMemo, useState } from "react";
import type { ActivityEntry } from "@open-hq/shared";
import { useActivity } from "../lib/queries";
import { Mark } from "../components/Mark";
import { Empty, ErrorState, Skeleton } from "../components/States";
import { AGENT_ORDER, agentName } from "../lib/agents";
import { dayKey, fmtDay, fmtTime } from "../lib/time";

const KIND: Record<ActivityEntry["kind"], string> = { model_call: "model", tool_call: "tool", message: "message", proposal: "proposal", execution: "execution", job: "Nebius job" };
const RUNTIME_TONE: Record<string, string> = { hermes: "info", loop: "lamp", nebius_job: "ok", app: "line" };
const n = (v: number | null) => (v == null ? "–" : v.toLocaleString("en-US"));

function Stats({ rows }: { rows: ActivityEntry[] }) {
  const calls = rows.filter((r) => r.kind === "model_call");
  const tokens = rows.reduce((s, r) => s + (r.tokensIn ?? 0) + (r.tokensOut ?? 0), 0);
  const usd = rows.reduce((s, r) => s + (r.usd ?? 0), 0);
  const ms = calls.length ? Math.round(calls.reduce((s, r) => s + (r.ms ?? 0), 0) / calls.length) : 0;
  const items = [["model calls", calls.length], ["tool calls", rows.filter((r) => r.kind === "tool_call").length], ["tokens", tokens.toLocaleString("en-US")], ["cost", `$${usd.toFixed(4)}`], ["avg model latency", `${(ms / 1000).toFixed(1)} s`]];
  return (
    <div className="stats">
      {items.map(([k, v]) => <div key={k} className="stat"><span className="eyebrow">{k}</span><b className="num">{v}</b></div>)}
    </div>
  );
}

export function Activity() {
  const [agent, setAgent] = useState("all");
  const q = useActivity(agent);
  const rows = useMemo(() => [...(q.data ?? [])].sort((a, b) => b.at.localeCompare(a.at)), [q.data]);
  return (
    <div className="page">
      <div className="page-h">
        <div>
          <span className="eyebrow lamp">Every model call and tool call</span>
          <h1>Activity log</h1>
          <p className="lede">What each agent did, on which NVIDIA model, through which runtime, and what it cost.</p>
        </div>
      </div>
      <div className="seg" role="group" aria-label="Filter by agent">
        <button aria-pressed={agent === "all"} onClick={() => setAgent("all")}>Everyone</button>
        {AGENT_ORDER.map((a) => <button key={a} aria-pressed={agent === a} onClick={() => setAgent(a)}><Mark id={a} size="xs" />{agentName(a)}</button>)}
      </div>
      {q.isPending ? (
        <div className="stack" role="status" aria-label="Loading activity"><Skeleton h={70} r={14} /><Skeleton h={420} r={14} /></div>
      ) : q.isError ? <ErrorState error={q.error} onRetry={() => void q.refetch()} title="Couldn't load the activity log" /> : rows.length === 0 ? (
        <Empty title="Nothing logged yet" icon="pulse">{agent === "all" ? "Run a workday from Tonight and every call shows up here as it happens." : `${agentName(agent)} hasn't run yet today.`}</Empty>
      ) : (
        <>
          <Stats rows={rows} />
          <div className="tablewrap">
            <table className="tbl act-tbl">
              <thead>
                <tr><th>Time</th><th>Agent</th><th>What happened</th><th>Model</th><th className="n">Tokens in/out</th><th className="n">Cost</th><th>Runtime</th><th className="n">ms</th></tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const newDay = i > 0 && dayKey(rows[i - 1].at) !== dayKey(r.at);
                  return (
                    <tr key={r.id} className={newDay ? "newday" : ""}>
                      <td className="mono tiny" data-l="time">{newDay || i === 0 ? <span className="muted">{fmtDay(r.at)} </span> : null}{fmtTime(r.at)}</td>
                      <td data-l="agent"><span className="row"><Mark id={r.agent} size="xs" /><span className="small">{agentName(r.agent)}</span></span></td>
                      <td className="act-what">
                        <span className="pill line">{KIND[r.kind]}</span> {r.summary}
                        {r.detail ? <div className="mono tiny muted act-detail">{r.detail}</div> : null}
                      </td>
                      <td className="mono tiny" data-l="model">{r.model ?? <span className="muted">–</span>}</td>
                      <td className="n" data-l="tokens">{r.tokensIn == null ? "–" : `${n(r.tokensIn)} / ${n(r.tokensOut)}`}</td>
                      <td className="n" data-l="cost">{r.usd == null ? "–" : `$${r.usd.toFixed(4)}`}</td>
                      <td data-l="runtime">{r.runtime ? <span className={`pill ${RUNTIME_TONE[r.runtime] ?? "line"}`}>{r.runtime}</span> : <span className="muted">–</span>}</td>
                      <td className="n" data-l="ms">{n(r.ms)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
