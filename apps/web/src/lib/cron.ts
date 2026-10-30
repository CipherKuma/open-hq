import { DAYS } from "./time";

// Plain-English for the cron shapes the agents use; anything else shows the raw expression.
function dayRange(dow: string) {
  if (dow === "*") return "daily";
  const m = /^(\d)-(\d)$/.exec(dow);
  if (m) return `${DAYS[+m[1]]}–${DAYS[+m[2]]}`;
  if (/^\d(,\d)*$/.test(dow)) return dow.split(",").map((d) => DAYS[+d]).join(", ");
  return null;
}

export function cronText(cron: string): string {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return cron;
  const [min, hour, dom, mon, dow] = parts;
  if (dom !== "*" || mon !== "*") return cron;
  const step = /^\*\/(\d+)$/.exec(min);
  if (step && hour === "*") return `every ${step[1]} min${dow === "*" ? "" : `, ${dayRange(dow) ?? dow}`}`;
  if (/^\d+$/.test(min) && hour === "*") return min === "0" ? "hourly" : `hourly at :${min.padStart(2, "0")}`;
  if (/^\d+$/.test(min) && /^\d+$/.test(hour)) {
    const days = dayRange(dow);
    return `${hour.padStart(2, "0")}:${min.padStart(2, "0")}${days ? ` ${days}` : ` (${dow})`}`;
  }
  return cron;
}
