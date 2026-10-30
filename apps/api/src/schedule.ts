// Founder schedule logic. Pure functions of (schedule, now); no I/O.
import type { Schedule } from "@open-hq/shared";

export interface LocalParts {
  date: string; // YYYY-MM-DD in the founder's timezone
  dow: number; // 0=Sun..6=Sat
  minutes: number; // minutes since local midnight
  y: number;
  m: number;
  d: number;
}

const DOW: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function localParts(now: Date, tz: string): LocalParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "0";
  const y = Number(get("year"));
  const m = Number(get("month"));
  const d = Number(get("day"));
  const hour = Number(get("hour")) % 24;
  return {
    date: `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
    dow: DOW[get("weekday")] ?? 0,
    minutes: hour * 60 + Number(get("minute")),
    y,
    m,
    d,
  };
}

export const hhmm = (s: string): number => {
  const [h, m] = s.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};
export const fmtHhmm = (mins: number): string =>
  `${String(Math.floor(mins / 60) % 24).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;

export function atDayJob(s: Schedule, now: Date): boolean {
  const l = localParts(now, s.timezone);
  return s.dayJob.some((b) => b.days.includes(l.dow) && l.minutes >= hhmm(b.start) && l.minutes < hhmm(b.end));
}

/** A message created now is queued for the founder unless it is urgent. */
export function isHeldDuringWork(s: Schedule, now: Date, level: string | null | undefined): boolean {
  return level !== "urgent" && atDayJob(s, now);
}

export interface FounderWindow {
  date: string; // local date of the window
  start: string; // HH:MM
  end: string; // HH:MM
  minutes: number;
  startsInMinutes: number; // from now; negative while inside the window
  active: boolean;
}

/** The founder window that is running now or starts next. */
export function nextFounderWindow(s: Schedule, now: Date): FounderWindow | null {
  const l = localParts(now, s.timezone);
  let best: FounderWindow | null = null;
  for (let i = 0; i <= 7; i++) {
    const day = new Date(Date.UTC(l.y, l.m - 1, l.d + i));
    const dow = (l.dow + i) % 7;
    for (const b of s.founderHours) {
      if (!b.days.includes(dow)) continue;
      const startAbs = i * 1440 + hhmm(b.start);
      const endAbs = i * 1440 + hhmm(b.end);
      if (endAbs <= l.minutes) continue;
      const cand: FounderWindow = {
        date: day.toISOString().slice(0, 10),
        start: b.start,
        end: b.end,
        minutes: hhmm(b.end) - hhmm(b.start),
        startsInMinutes: startAbs - l.minutes,
        active: startAbs <= l.minutes,
      };
      if (!best || cand.startsInMinutes < best.startsInMinutes) best = cand;
    }
    if (best) break;
  }
  return best;
}

/** ISO instant of local midnight for the founder's current day (used for daily budgets). */
export function dayStartIso(tz: string, now: Date): string {
  const l = localParts(now, tz);
  const asUtc = Date.UTC(l.y, l.m - 1, l.d, Math.floor(l.minutes / 60), l.minutes % 60);
  const offsetMs = asUtc - Math.floor(now.getTime() / 60000) * 60000;
  return new Date(Date.UTC(l.y, l.m - 1, l.d) - offsetMs).toISOString();
}

export interface CronDecision {
  key: string;
  task: "ship" | "revenue" | "support" | "scout" | "cos_midday" | "handover" | "wrapup";
}

/** Which tasks are due on this 10-minute cron tick. Keys make each firing idempotent. */
export function dueTasks(s: Schedule, now: Date): CronDecision[] {
  const l = localParts(now, s.timezone);
  const out: CronDecision[] = [];
  const tick = Math.floor(l.minutes / 10);
  const hour = Math.floor(l.minutes / 60);
  const within = (target: number) => l.minutes >= target && l.minutes < target + 10;
  // Token Factory free tier: Ship every 2 h, Revenue and Support every 3 h (offset), not every tick.
  if (l.minutes % 120 < 10) out.push({ key: `ship:${l.date}:${tick}`, task: "ship" });
  if (l.minutes % 180 < 10) out.push({ key: `revenue:${l.date}:${hour}`, task: "revenue" });
  if (l.minutes % 180 >= 90 && l.minutes % 180 < 100) out.push({ key: `support:${l.date}:${hour}`, task: "support" });
  if (within(6 * 60)) out.push({ key: `scout:${l.date}`, task: "scout" });
  if (within(12 * 60 + 30)) out.push({ key: `cos_midday:${l.date}`, task: "cos_midday" });
  if (within(23 * 60)) out.push({ key: `wrapup:${l.date}`, task: "wrapup" });
  for (const b of s.founderHours) {
    if (!b.days.includes(l.dow)) continue;
    const at = hhmm(b.start) - s.handoverLeadMinutes;
    if (within(at)) out.push({ key: `handover:${l.date}:${b.start}`, task: "handover" });
  }
  return out;
}
