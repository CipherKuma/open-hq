import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useConnections, useHandover, useWorkspace } from "../lib/queries";
import { BrandMark } from "../layout/BrandMark";
import { Icon } from "../components/Icon";
import { Mark } from "../components/Mark";
import { Empty, ErrorState, LoadingBlock, errorText } from "../components/States";
import { ConnectionRow, useLink } from "./Connections";
import { WeekGrid } from "./schedule/WeekGrid";
import { HoursEditor, InterruptionsEditor } from "./schedule/Editors";
import { useScheduleDraft } from "./schedule/useScheduleDraft";
import { fmtMinutes } from "../lib/time";

const STEPS = ["Products", "Connect", "Schedule", "Interruptions", "First handover"];
const KEY_TOOLKITS = ["github", "stripe", "gmail", "sentry"];

function Products() {
  const ws = useWorkspace();
  if (ws.isPending) return <LoadingBlock rows={3} />;
  if (ws.isError) return <ErrorState error={ws.error} onRetry={() => void ws.refetch()} />;
  return (
    <div className="stack">
      {ws.data.products.length === 0 ? <Empty title="No products yet" icon="box">Connect a GitHub repo and a Stripe account in the next step and they appear here.</Empty> : ws.data.products.map((p) => (
        <div key={p.id} className="card flat welcome-prod">
          <Icon name="box" />
          <div className="grow"><b>{p.name}</b><div className="small dim">{p.tagline}</div></div>
          <a className="mono tiny" href={p.url} target="_blank" rel="noreferrer">{p.url.replace(/^https?:\/\//, "")}</a>
        </div>
      ))}
      <p className="small muted">The agents watch every product here. Each one gets its own dashboard, and the handover ranks across all of them.</p>
    </div>
  );
}

function Connect() {
  const q = useConnections();
  const l = useLink();
  if (q.isPending) return <LoadingBlock rows={4} />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const rows = q.data.filter((c) => KEY_TOOLKITS.includes(c.toolkit));
  return (
    <div className="stack">
      <div className="card flat"><ul className="conns">{rows.map((c) => <ConnectionRow key={c.toolkit} c={c} l={l} />)}</ul></div>
      <p className="small muted">A connection counts as done only after its first read succeeds. <Link to="/connections">See all {q.data.length} apps</Link>.</p>
    </div>
  );
}

function Preview() {
  const q = useHandover();
  if (q.isPending) return <LoadingBlock rows={3} label="Loading handover preview" />;
  if (q.isError) return <Empty title="Your first handover isn't written yet" icon="lamp">It arrives {""}15 minutes before your next founder hours. You can also run a workday from Tonight to see one now.</Empty>;
  const h = q.data;
  return (
    <div className="card flat stack">
      <div className="card-h"><h3>Tonight · {h.window.start}–{h.window.end}</h3><span className="pill lamp">{h.decisions.filter((d) => d.status === "pending").length} decisions</span></div>
      <ul className="since-list">{h.since.slice(0, 3).map((s, i) => <li key={i}><Mark id={s.agent} size="sm" /><p className="small">{s.text}</p></li>)}</ul>
      <p className="small dim">{h.todo.length} tasks, {fmtMinutes(h.plannedMinutes)} of your {fmtMinutes(h.window.minutes)} evening.</p>
    </div>
  );
}

export function Welcome() {
  const [step, setStep] = useState(0);
  const nav = useNavigate();
  const sd = useScheduleDraft();
  const scheduleStep = step === 2 || step === 3;
  const next = async () => {
    if (scheduleStep && sd.draft && sd.dirty) {
      try { await sd.save.mutateAsync(sd.draft); } catch { return; }
    }
    if (step === STEPS.length - 1) nav("/");
    else setStep(step + 1);
  };
  return (
    <div className="welcome">
      <header className="welcome-h"><span className="brand"><BrandMark />Open HQ</span><Link to="/" className="btn ghost sm">Skip setup</Link></header>
      <ol className="stepper" aria-label="Setup steps">
        {STEPS.map((s, i) => (
          <li key={s} className={i === step ? "on" : i < step ? "done" : ""} aria-current={i === step ? "step" : undefined}>
            <button type="button" onClick={() => setStep(i)}><span className="mono">{i < step ? "✓" : i + 1}</span>{s}</button>
          </li>
        ))}
      </ol>
      <main className="welcome-body">
        <span className="eyebrow lamp">Step {step + 1} of 5</span>
        <h1>{["Your products", "Connect your apps", "Your day job and founder hours", "What may interrupt you", "Your first handover"][step]}</h1>
        <p className="lede dim">{[
          "Five agents look after these while you're at work.",
          "Agents get read-only access to their own apps. Changes always come to you first.",
          "Agents stay quiet during the day job. The handover lands just before you start.",
          "During work hours only these reach your phone. Everything else waits for tonight.",
          "This is what you'll see when you sit down tonight.",
        ][step]}</p>
        <div className="welcome-step">
          {step === 0 ? <Products /> : step === 1 ? <Connect /> : step === 4 ? <Preview /> : sd.q.isError ? <ErrorState error={sd.q.error} onRetry={() => void sd.q.refetch()} /> : !sd.draft ? <LoadingBlock rows={3} /> : step === 2 ? (
            <div className="stack loose"><div className="card flat"><WeekGrid s={sd.draft} /></div><HoursEditor s={sd.draft} set={sd.setDraft} /></div>
          ) : <InterruptionsEditor s={sd.draft} set={sd.setDraft} />}
          {scheduleStep && sd.save.isError ? <div className="notice bad" role="alert"><Icon name="alert" />{errorText(sd.save.error)}</div> : null}
        </div>
        <footer className="welcome-foot">
          <button className="btn ghost" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}><Icon name="back" />Back</button>
          <button className="btn primary" onClick={() => void next()} disabled={sd.save.isPending || (scheduleStep && sd.errors.length > 0)}>
            {sd.save.isPending ? <span className="spin" /> : null}{step === STEPS.length - 1 ? "Open tonight's handover" : scheduleStep && sd.dirty ? "Save and continue" : "Continue"}<Icon name="chev" />
          </button>
        </footer>
      </main>
    </div>
  );
}
