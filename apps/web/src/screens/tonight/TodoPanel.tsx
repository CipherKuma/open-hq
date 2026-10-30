import { useEffect, useState } from "react";
import type { Handover } from "@open-hq/shared";
import { Mark } from "../../components/Mark";
import { fmtMinutes } from "../../lib/time";

const key = (date: string) => `openhq.todo.${date}`;
function loadDone(date: string): string[] {
  try { return JSON.parse(localStorage.getItem(key(date)) ?? "[]") as string[]; } catch { return []; }
}

// Tonight's list measured against the founder window: one segment per task, then the buffer.
export function TodoPanel({ h }: { h: Handover }) {
  const [done, setDone] = useState<string[]>(() => [...h.todo.filter((t) => t.done).map((t) => t.id), ...loadDone(h.date)]);
  useEffect(() => { try { localStorage.setItem(key(h.date), JSON.stringify(done)); } catch { /* private mode */ } }, [done, h.date]);
  const window = Math.max(1, h.window.minutes);
  const planned = h.todo.reduce((n, t) => n + t.minutes, 0) || h.plannedMinutes;
  const left = h.todo.filter((t) => !done.includes(t.id)).reduce((n, t) => n + t.minutes, 0);
  const buffer = Math.max(0, window - planned);
  const over = planned > window;
  const toggle = (id: string) => setDone((d) => (d.includes(id) ? d.filter((x) => x !== id) : [...d, id]));

  return (
    <section className="card todo" aria-labelledby="todo-h">
      <div className="card-h">
        <h2 id="todo-h">Tonight's list</h2>
        <span className="mono small"><b className="num">{fmtMinutes(planned)}</b> <span className="muted">of {fmtMinutes(window)}</span></span>
      </div>
      <div className="fill" role="img" aria-label={`${fmtMinutes(planned)} planned of a ${fmtMinutes(window)} window, ${fmtMinutes(buffer)} buffer`}>
        {h.todo.map((t) => (
          <i key={t.id} className={done.includes(t.id) ? "done" : ""} style={{ width: `${(t.minutes / Math.max(window, planned)) * 100}%` }} title={`${t.title} · ${t.minutes} min`} />
        ))}
        {buffer ? <i className="buf" style={{ width: `${(buffer / window) * 100}%` }} title={`Buffer · ${buffer} min`} /> : null}
      </div>
      <div className="fill-legend mono tiny">
        <span>{h.window.start}</span>
        <span className={over ? "bad-text" : "muted"}>{over ? `${fmtMinutes(planned - window)} over the window` : `${fmtMinutes(buffer)} buffer`} · {fmtMinutes(left)} left to do</span>
        <span>{h.window.end}</span>
      </div>
      {h.todo.length === 0 ? <p className="small muted">Nothing planned. The Chief of Staff found nothing that needs your hands tonight.</p> : (
        <ul className="todo-list">
          {h.todo.map((t) => (
            <li key={t.id} className={done.includes(t.id) ? "done" : ""}>
              <label>
                <input type="checkbox" checked={done.includes(t.id)} onChange={() => toggle(t.id)} />
                <span className="todo-t">{t.title}</span>
              </label>
              {t.agent ? <Mark id={t.agent} size="xs" /> : <span />}
              <span className="mono tiny muted num">{t.minutes}m</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
