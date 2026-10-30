import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import type { AgentId } from "@open-hq/shared";
import { api } from "../../api";
import { useLive } from "../../live/LiveProvider";
import { Icon } from "../../components/Icon";
import { Mark } from "../../components/Mark";
import { errorText } from "../../components/States";
import { AGENT_ORDER, agentName } from "../../lib/agents";
import { fmtTime } from "../../lib/time";

type Lane = "queued" | "working" | "done";
type Run = { runId: string; phase: "running" | "done" | "slow"; lanes: Record<AgentId, Lane>; feed: { id: string; agent: string; text: string; at: string }[] };
const fresh = (runId: string): Run => ({ runId, phase: "running", lanes: { cos: "queued", revenue: "queued", support: "queued", ship: "queued", scout: "queued" }, feed: [] });

export function WorkdayButton({ onStart, disabled }: { onStart: () => void; disabled?: boolean }) {
  return <button className="btn primary" onClick={onStart} disabled={disabled}><Icon name="play" />Run a workday now</button>;
}

// A run survives a remount or reload for 5 minutes, so progress keeps showing if the page refreshes mid-run.
const KEY = "openhq.workday";
function restore(): Run | null {
  try {
    const saved = JSON.parse(sessionStorage.getItem(KEY) ?? "null") as { run: Run; at: number } | null;
    return saved && saved.run.phase === "running" && Date.now() - saved.at < 300_000 ? saved.run : null;
  } catch { return null; }
}

export function useWorkdayRun() {
  const { subscribe, state } = useLive();
  const [run, setRun] = useState<Run | null>(restore);
  const active = useRef(run?.phase === "running");
  const startedAt = useRef(Date.now());
  useEffect(() => {
    try {
      if (run?.phase === "running") sessionStorage.setItem(KEY, JSON.stringify({ run, at: startedAt.current }));
      else sessionStorage.removeItem(KEY);
    } catch { /* storage unavailable */ }
  }, [run]);
  const start = useMutation({
    mutationFn: api.runWorkday,
    onMutate: () => { active.current = true; startedAt.current = Date.now(); setRun(fresh("starting")); },
    onSuccess: ({ runId }) => setRun((r) => (r ? { ...r, runId } : fresh(runId))),
    // 409: a run is already in flight, so keep listening and show its progress instead of failing.
    onError: (err) => {
      if ((err as { status?: number }).status === 409) { setRun((r) => (r ? { ...r, runId: "already running" } : fresh("already running"))); return; }
      active.current = false;
      setRun(null);
    },
  });

  useEffect(() => subscribe((e) => {
    if (!active.current) return;
    setRun((r) => {
      if (!r) return r;
      if (e.type === "agent_status") {
        const prev = r.lanes[e.data.id];
        const lane: Lane = e.data.status === "working" ? "working" : prev === "working" ? "done" : prev;
        return { ...r, lanes: { ...r.lanes, [e.data.id]: lane } };
      }
      if (e.type === "activity") {
        return { ...r, feed: [{ id: e.data.id, agent: e.data.agent, text: e.data.summary, at: e.data.at }, ...r.feed].slice(0, 6) };
      }
      if (e.type === "handover") {
        active.current = false;
        return { ...r, phase: "done", lanes: { ...r.lanes, cos: "done" } };
      }
      return r;
    });
  }), [subscribe]);

  useEffect(() => {
    if (run?.phase !== "running") return;
    const t = setTimeout(() => setRun((r) => (r && r.phase === "running" ? { ...r, phase: "slow" } : r)), 180_000);
    return () => clearTimeout(t);
  }, [run?.phase, run?.runId]);

  return { run, start: () => start.mutate(), starting: start.isPending, error: start.error, liveState: state, dismiss: () => setRun(null) };
}

export function WorkdayPanel({ w }: { w: ReturnType<typeof useWorkdayRun> }) {
  const status = (w.error as { status?: number } | null)?.status;
  if (w.error && status === 429) return <div className="notice lamp" role="status"><Icon name="clock" />Workday runs are limited to 3 an hour so the demo stays affordable. Try again a little later; tonight's handover is unchanged.</div>;
  if (w.error && status !== 409) return <div className="notice bad" role="alert"><Icon name="alert" />Couldn't start the workday: {errorText(w.error)}</div>;
  const r = w.run;
  if (!r) return null;
  const done = AGENT_ORDER.filter((a) => r.lanes[a] === "done").length;
  return (
    <section className="card workday" aria-live="polite" aria-label="Workday run progress">
      <div className="card-h">
        <div className="row">
          {r.phase === "done" ? <Icon name="check" className="ico ok-text" /> : <span className="spin lamp-text" />}
          <h2>{r.phase === "done" ? "Workday finished. Handover rewritten." : r.phase === "slow" ? "Still running in the background" : "Running every agent's shift"}</h2>
        </div>
        <div className="row">
          <span className="mono tiny muted">{r.runId === "starting" ? "starting…" : r.runId}</span>
          {r.phase !== "running" ? <button className="btn ghost sm" onClick={w.dismiss}>Dismiss</button> : null}
        </div>
      </div>
      <div className="wd-bar" role="progressbar" aria-valuemin={0} aria-valuemax={5} aria-valuenow={done} aria-label="Agents finished">
        <i style={{ width: `${(done / 5) * 100}%` }} />
      </div>
      <div className="wd-lanes">
        {AGENT_ORDER.map((a) => (
          <div key={a} className={`wd-lane ${r.lanes[a]}`}>
            <Mark id={a} size="sm" status={r.lanes[a] === "working" ? "working" : undefined} />
            <span className="small">{agentName(a)}</span>
            <span className="mono tiny">{r.lanes[a] === "queued" ? "waiting" : r.lanes[a]}</span>
          </div>
        ))}
      </div>
      {w.liveState !== "open" ? <p className="small muted">Live updates are reconnecting. Progress will appear when they're back.</p> : null}
      {r.feed.length ? (
        <ol className="wd-feed">
          {r.feed.map((f) => (
            <li key={f.id}><span className="mono tiny muted">{fmtTime(f.at)}</span><Mark id={f.agent} size="xs" /><span className="ellipsis">{f.text}</span></li>
          ))}
        </ol>
      ) : <p className="small muted">Waiting for the first agent to report…</p>}
    </section>
  );
}
