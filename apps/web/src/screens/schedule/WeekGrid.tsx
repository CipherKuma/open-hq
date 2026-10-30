import type { Schedule } from "@open-hq/shared";
import { DAYS, fromMinutes, toMinutes } from "../../lib/time";

const ROWS = [1, 2, 3, 4, 5, 6, 0];
type B = Schedule["dayJob"][number];

// The week at a glance: day job (agents quiet, working in the background), founder hours, handover marker.
export function WeekGrid({ s }: { s: Schedule }) {
  const all = [...s.dayJob, ...s.founderHours];
  const earliest = Math.min(6 * 60, ...all.map((b) => toMinutes(b.start) - s.handoverLeadMinutes));
  const start = Math.max(0, Math.floor(earliest / 180) * 180);
  const end = 24 * 60;
  const span = end - start;
  const pos = (m: number) => `${((Math.min(end, Math.max(start, m)) - start) / span) * 100}%`;
  const width = (b: B) => `${((Math.min(end, toMinutes(b.end) <= toMinutes(b.start) ? end : toMinutes(b.end)) - Math.max(start, toMinutes(b.start))) / span) * 100}%`;
  const ticks: number[] = [];
  for (let t = start; t <= end; t += 180) ticks.push(t);

  return (
    <div className="week" role="img" aria-label={`Week schedule in ${s.timezone}: day job, founder hours, and a handover ${s.handoverLeadMinutes} minutes before founder hours.`}>
      <div className="week-axis">
        <span />
        <div className="week-track">
          {ticks.map((t) => <span key={t} className="week-tick" style={{ left: pos(t) }}>{fromMinutes(t === 1440 ? 0 : t).replace(/^00:00$/, "24:00")}</span>)}
        </div>
      </div>
      {ROWS.map((d) => (
        <div key={d} className="week-row">
          <span className="week-day mono">{DAYS[d]}</span>
          <div className="week-track lane">
            {ticks.map((t) => <i key={t} className="week-grid" style={{ left: pos(t) }} />)}
            {s.dayJob.filter((b) => b.days.includes(d)).map((b, i) => (
              <span key={`dj${i}`} className="blk dj" style={{ left: pos(toMinutes(b.start)), width: width(b) }} title={`Day job ${b.start}–${b.end}`}>
                <span className="blk-l">day job · agents working</span>
              </span>
            ))}
            {s.founderHours.filter((b) => b.days.includes(d)).map((b, i) => (
              <span key={`fh${i}`}>
                <span className="blk fh" style={{ left: pos(toMinutes(b.start)), width: width(b) }} title={`Founder hours ${b.start}–${b.end}`}>
                  <span className="blk-l">{b.start}–{b.end}</span>
                </span>
                <span className="handover" style={{ left: pos(toMinutes(b.start) - s.handoverLeadMinutes) }} title={`Handover at ${fromMinutes(toMinutes(b.start) - s.handoverLeadMinutes)}`} />
              </span>
            ))}
          </div>
        </div>
      ))}
      <div className="legend">
        <span><i className="lgd dj" />Day job: only urgent alerts reach you</span>
        <span><i className="lgd fh" />Founder hours</span>
        <span><i className="lgd ho" />Handover, {s.handoverLeadMinutes} min before you start</span>
      </div>
    </div>
  );
}
