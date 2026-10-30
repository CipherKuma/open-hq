// All times render in the founder's timezone (from the workspace schedule), not the viewer's.
let tz = "Asia/Kuala_Lumpur";
export const setTimezone = (next: string) => { tz = next; };
export const getTimezone = () => tz;

const fmt = (iso: string, opts: Intl.DateTimeFormatOptions) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, ...opts }).format(d);
};

export const fmtTime = (iso: string) => fmt(iso, { hour: "2-digit", minute: "2-digit", hour12: false });
export const fmtDay = (iso: string) => fmt(iso, { weekday: "short", day: "numeric", month: "short" });
export const fmtDayTime = (iso: string) => `${fmtDay(iso)} · ${fmtTime(iso)}`;
export const dayKey = (iso: string) => fmt(iso, { year: "numeric", month: "2-digit", day: "2-digit" });

export function fmtDate(ymd: string) {
  const d = new Date(`${ymd}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return ymd;
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(d);
}

export function ago(iso: string | null) {
  if (!iso) return "never";
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return fmtDay(iso);
}

export function fmtMinutes(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m}` : `${h} h`;
}

export const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};
export const fromMinutes = (min: number) => {
  const v = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(v / 60)).padStart(2, "0")}:${String(v % 60).padStart(2, "0")}`;
};

export const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
