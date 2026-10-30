import { Icon } from "../components/Icon";
import { ErrorState, Skeleton, errorText } from "../components/States";
import { WeekGrid } from "./schedule/WeekGrid";
import { HoursEditor, InterruptionsEditor } from "./schedule/Editors";
import { useScheduleDraft } from "./schedule/useScheduleDraft";

export function ScheduleScreen() {
  const { q, draft, setDraft, save, errors, dirty, reset } = useScheduleDraft();
  return (
    <div className="page">
      <div className="page-h">
        <div>
          <span className="eyebrow lamp">Your week</span>
          <h1>Schedule</h1>
          <p className="lede">Agents work through your day job without disturbing you. The handover lands just before your founder hours, sized to the time you have.</p>
        </div>
        {draft ? (
          <div className="row wrap">
            {dirty ? <button className="btn ghost" onClick={reset}>Discard</button> : null}
            <button className="btn primary" disabled={!dirty || errors.length > 0 || save.isPending} onClick={() => draft && save.mutate(draft)}>
              {save.isPending ? <span className="spin" /> : <Icon name="check" />}Save schedule
            </button>
          </div>
        ) : null}
      </div>
      {q.isPending || (!draft && !q.isError) ? (
        <div className="stack" role="status" aria-label="Loading schedule"><Skeleton h={300} r={14} /><Skeleton h={240} r={14} /></div>
      ) : q.isError ? <ErrorState error={q.error} onRetry={() => void q.refetch()} title="Couldn't load your schedule" /> : draft ? (
        <>
          {save.isError ? <div className="notice bad" role="alert"><Icon name="alert" />{errorText(save.error)}</div> : null}
          {save.isSuccess && !dirty ? <div className="notice" role="status"><Icon name="check" />Saved. The next handover uses these hours.</div> : null}
          <section className="card"><WeekGrid s={draft} /></section>
          <div className="grid2 sched-edit">
            <section className="card"><HoursEditor s={draft} set={setDraft} /></section>
            <section className="card"><InterruptionsEditor s={draft} set={setDraft} /></section>
          </div>
        </>
      ) : null}
    </div>
  );
}
