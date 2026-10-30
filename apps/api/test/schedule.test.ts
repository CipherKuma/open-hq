import { describe, expect, it } from "vitest";
import type { Schedule } from "@open-hq/shared";
import { atDayJob, dayStartIso, dueTasks, isHeldDuringWork, nextFounderWindow } from "../src/schedule";

const schedule: Schedule = {
  timezone: "Asia/Kuala_Lumpur",
  dayJob: [{ days: [1, 2, 3, 4, 5, 6], start: "09:00", end: "18:00" }],
  founderHours: [{ days: [1, 2, 3, 4, 5, 6], start: "19:00", end: "23:00" }, { days: [0], start: "10:00", end: "16:00" }],
  handoverLeadMinutes: 15,
  urgentRules: ["site_down"],
  channel: "app",
};
// 2026-10-30 is a Friday. Kuala Lumpur is UTC+8.
const at = (hhmm: string, date = "2026-10-30") => new Date(`${date}T${hhmm}:00+08:00`);

describe("schedule", () => {
  it("holds non-urgent messages created during the day job", () => {
    expect(atDayJob(schedule, at("11:00"))).toBe(true);
    expect(isHeldDuringWork(schedule, at("11:00"), "tonight")).toBe(true);
    expect(isHeldDuringWork(schedule, at("11:00"), null)).toBe(true);
  });
  it("never holds urgent messages", () => {
    expect(isHeldDuringWork(schedule, at("11:00"), "urgent")).toBe(false);
  });
  it("does not hold outside the day job or on Sunday", () => {
    expect(isHeldDuringWork(schedule, at("20:00"), "tonight")).toBe(false);
    expect(isHeldDuringWork(schedule, at("11:00", "2026-11-01"), "tonight")).toBe(false);
  });
  it("finds the next founder window", () => {
    const w = nextFounderWindow(schedule, at("14:00"))!;
    expect(w).toMatchObject({ date: "2026-10-30", start: "19:00", end: "23:00", minutes: 240, active: false, startsInMinutes: 300 });
    expect(nextFounderWindow(schedule, at("21:00"))!.active).toBe(true);
    expect(nextFounderWindow(schedule, at("23:30"))!).toMatchObject({ date: "2026-10-31", start: "19:00" });
    expect(nextFounderWindow(schedule, at("23:30", "2026-10-31"))!).toMatchObject({ date: "2026-11-01", start: "10:00", minutes: 360 });
  });
  it("dispatches the handover once, 15 minutes before the window", () => {
    expect(dueTasks(schedule, at("18:50")).map((d) => d.task)).toContain("handover");
    expect(dueTasks(schedule, at("18:40")).map((d) => d.task)).not.toContain("handover");
    expect(dueTasks(schedule, at("12:30")).map((d) => d.task)).toContain("cos_midday");
    expect(dueTasks(schedule, at("06:00")).map((d) => d.task)).toContain("scout");
  });
  it("computes the local day start for daily budgets", () => {
    expect(dayStartIso("Asia/Kuala_Lumpur", at("14:00"))).toBe("2026-10-29T16:00:00.000Z");
  });
});
