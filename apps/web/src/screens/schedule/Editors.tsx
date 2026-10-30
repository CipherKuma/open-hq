import type { Schedule } from "@open-hq/shared";
import { Icon } from "../../components/Icon";
import { DAYS, toMinutes } from "../../lib/time";

type B = Schedule["dayJob"][number];
const ORDER = [1, 2, 3, 4, 5, 6, 0];
export const URGENT_RULES = [
  { id: "site_down", label: "The site is down" },
  { id: "checkout_failing", label: "Checkout is failing" },
  { id: "security", label: "A security alert" },
  { id: "angry_paying_customer", label: "A paying customer is angry" },
  { id: "mrr_drop", label: "MRR drops more than 5% in a day" },
];
export const CHANNELS: { id: Schedule["channel"]; label: string }[] = [
  { id: "app", label: "Open HQ only" }, { id: "email", label: "Email" }, { id: "telegram", label: "Telegram" }, { id: "slack", label: "Slack" }, { id: "discord", label: "Discord" },
];
const TIMEZONES = ["Asia/Kuala_Lumpur", "Asia/Singapore", "Asia/Kolkata", "Europe/London", "Europe/Berlin", "America/New_York", "America/Los_Angeles"];

export const blockError = (b: B) => (!b.days.length ? "Pick at least one day" : toMinutes(b.end) <= toMinutes(b.start) ? "End must be after start" : null);
export const scheduleErrors = (s: Schedule) => [...s.dayJob, ...s.founderHours].map(blockError).filter(Boolean) as string[];

function BlockList({ label, blocks, onChange, hint }: { label: string; blocks: B[]; onChange: (b: B[]) => void; hint: string }) {
  const set = (i: number, next: B) => onChange(blocks.map((b, j) => (j === i ? next : b)));
  return (
    <fieldset className="blocks">
      <legend><h3>{label}</h3><span className="small muted">{hint}</span></legend>
      {blocks.map((b, i) => {
        const err = blockError(b);
        return (
          <div key={i} className={`blockrow ${err ? "err" : ""}`}>
            <div className="days" role="group" aria-label={`${label} ${i + 1} days`}>
              {ORDER.map((d) => (
                <button key={d} type="button" aria-pressed={b.days.includes(d)} onClick={() => set(i, { ...b, days: b.days.includes(d) ? b.days.filter((x) => x !== d) : [...b.days, d].sort() })}>{DAYS[d].slice(0, 2)}</button>
              ))}
            </div>
            <div className="row">
              <input className="input time" type="time" value={b.start} aria-label="Start" onChange={(e) => set(i, { ...b, start: e.target.value })} />
              <span className="muted">–</span>
              <input className="input time" type="time" value={b.end} aria-label="End" onChange={(e) => set(i, { ...b, end: e.target.value })} />
              <button type="button" className="btn ghost icon" aria-label="Remove block" onClick={() => onChange(blocks.filter((_, j) => j !== i))}><Icon name="trash" /></button>
            </div>
            {err ? <span className="tiny bad-text">{err}</span> : null}
          </div>
        );
      })}
      <button type="button" className="btn sm ghost" onClick={() => onChange([...blocks, { days: [0], start: "10:00", end: "14:00" }])}><Icon name="plus" />Add a block</button>
    </fieldset>
  );
}

export function HoursEditor({ s, set }: { s: Schedule; set: (s: Schedule) => void }) {
  return (
    <div className="stack loose">
      <BlockList label="Day job" blocks={s.dayJob} onChange={(dayJob) => set({ ...s, dayJob })} hint="Agents keep working and hold everything non-urgent." />
      <BlockList label="Founder hours" blocks={s.founderHours} onChange={(founderHours) => set({ ...s, founderHours })} hint="Tonight's list is sized to these." />
      <div className="grid2">
        <label className="field">Handover lands before founder hours
          <select className="select" value={s.handoverLeadMinutes} onChange={(e) => set({ ...s, handoverLeadMinutes: Number(e.target.value) })}>
            {[0, 5, 10, 15, 20, 30, 45, 60].map((m) => <option key={m} value={m}>{m} min</option>)}
          </select>
        </label>
        <label className="field">Timezone
          <select className="select" value={s.timezone} onChange={(e) => set({ ...s, timezone: e.target.value })}>
            {[...new Set([s.timezone, ...TIMEZONES])].map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
      </div>
    </div>
  );
}

export function InterruptionsEditor({ s, set }: { s: Schedule; set: (s: Schedule) => void }) {
  const rules = [...URGENT_RULES, ...s.urgentRules.filter((r) => !URGENT_RULES.some((u) => u.id === r)).map((id) => ({ id, label: id.replace(/_/g, " ") }))];
  const toggle = (id: string) => set({ ...s, urgentRules: s.urgentRules.includes(id) ? s.urgentRules.filter((r) => r !== id) : [...s.urgentRules, id] });
  return (
    <div className="stack loose">
      <fieldset className="blocks">
        <legend><h3>What may interrupt your day job</h3><span className="small muted">Everything else waits for the handover.</span></legend>
        <div className="chips">
          {rules.map((r) => <label key={r.id} className="check"><input type="checkbox" checked={s.urgentRules.includes(r.id)} onChange={() => toggle(r.id)} />{r.label}</label>)}
        </div>
      </fieldset>
      <label className="field" style={{ maxWidth: 320 }}>Where the handover and urgent alerts arrive
        <select className="select" value={s.channel} onChange={(e) => set({ ...s, channel: e.target.value as Schedule["channel"] })}>
          {CHANNELS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
      </label>
    </div>
  );
}
