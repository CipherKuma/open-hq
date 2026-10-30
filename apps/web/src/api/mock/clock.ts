// Fixture timestamps anchored to "today" in Kuala Lumpur so the demo world always reads as this evening.
const KL = "Asia/Kuala_Lumpur";
export const klDate = (offsetDays = 0) => {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: KL, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
};
export const at = (hhmm: string, offsetDays = 0) => new Date(`${klDate(offsetDays)}T${hhmm}:00+08:00`).toISOString();
export const nowIso = () => new Date().toISOString();
export const uid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 10)}`;
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const series = (days: number, start: number, end: number, wobble: number) =>
  Array.from({ length: days }, (_, i) => {
    const base = start + ((end - start) * i) / (days - 1);
    const noise = Math.sin(i * 1.7) * wobble + Math.cos(i * 0.6) * wobble * 0.5;
    return { t: `${klDate(i - days + 1)}T00:00:00+08:00`, v: Math.round((base + noise) * 100) / 100 };
  });
