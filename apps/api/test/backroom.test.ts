import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Env } from "../src/env";
import { testEnv } from "./helpers";

const dispatched: { kind: string; agent?: string }[] = [];
vi.mock("../src/jobs", () => ({ dispatchJob: vi.fn(async (_e: unknown, job: { kind: string; agent?: string }) => { dispatched.push(job); return "job"; }) }));

import { BACKROOM_CAP, postBackroomReply, sendBackroom, threadVerdict } from "../src/backroom";

let env: Env;
let dispose: () => Promise<void>;
beforeAll(async () => ({ env, dispose } = await testEnv()));
afterAll(() => dispose());

describe("back room", () => {
  it("threadVerdict closes the thread at the cap", () => {
    expect(BACKROOM_CAP).toBe(6);
    expect(threadVerdict(5)).toBe("open");
    expect(threadVerdict(6)).toBe("full");
  });
  it("caps a thread at 6 messages and escalates to the Chief of Staff once", async () => {
    const first = await sendBackroom(env, { from: "ship", to: "support", text: "Need the customer's timestamp." });
    expect(first.delivered).toBe(true);
    const { threadId, channelId } = first;
    for (let i = 0; i < 2; i++) {
      await postBackroomReply(env, channelId, "support", `reply ${i}`);
      await sendBackroom(env, { from: "ship", to: "support", text: `follow up ${i}`, threadId });
    }
    // messages so far: 1 + 2 * (reply + send) = 5; one more reply fills the thread to 6
    expect(await postBackroomReply(env, channelId, "support", "reply final")).toBe(true);
    const count = async () => (await env.DB.prepare("SELECT COUNT(*) AS n FROM messages WHERE channel_id = ? AND author != 'system'").bind(channelId).first<{ n: number }>())!.n;
    expect(await count()).toBe(6);
    const blocked = await sendBackroom(env, { from: "ship", to: "support", text: "seventh", threadId });
    expect(blocked).toMatchObject({ delivered: false, escalated: true });
    expect(await postBackroomReply(env, channelId, "support", "late reply")).toBe(false);
    expect(await count()).toBe(6);
    const escalations = dispatched.filter((j) => j.kind === "backroom" && j.agent === "cos");
    expect(escalations).toHaveLength(1);
    const sys = await env.DB.prepare("SELECT COUNT(*) AS n FROM messages WHERE channel_id = ? AND author = 'system'").bind(channelId).first<{ n: number }>();
    expect(sys!.n).toBe(1);
  });
  it("refuses an agent messaging itself", async () => {
    await expect(sendBackroom(env, { from: "ship", to: "ship", text: "hi" })).rejects.toThrow();
  });
});
