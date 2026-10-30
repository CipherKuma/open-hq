import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Env } from "../src/env";
import { testEnv } from "./helpers";

vi.mock("../src/integrations", () => ({ execute: vi.fn(async () => ({ ok: true, detail: "ran", url: null })) }));

import { checkHash, decide, executeProposal } from "../src/proposals";
import { createProposal, getProposal } from "../src/store/proposals";
import { canonicalJson, payloadHashOf } from "../src/util";

let env: Env;
let dispose: () => Promise<void>;
beforeAll(async () => ({ env, dispose } = await testEnv()));
afterAll(() => dispose());

const mk = (payload: Record<string, unknown>) =>
  createProposal(env, { agent: "revenue", kind: "stripe_refund", title: "Refund ch_1", why: "duplicate charge", payload, level: "tonight" });

describe("payload hash", () => {
  it("is order-independent (canonical JSON)", async () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}');
    expect(await payloadHashOf({ a: 1, b: 2 })).toBe(await payloadHashOf({ b: 2, a: 1 }));
  });
});

describe("decision", () => {
  it("rejects a decision whose payloadHash does not match, and executes nothing", async () => {
    const { proposal } = await mk({ chargeId: "ch_1", amount: 1200 });
    const start = vi.fn(async () => {});
    await expect(decide(env, proposal.id, "approve", "0".repeat(64), start)).rejects.toMatchObject({ status: 409, code: "hash_mismatch" });
    expect(start).not.toHaveBeenCalled();
    expect((await getProposal(env, proposal.id))!.status).toBe("pending");
  });
  it("refuses a proposal whose stored payload no longer matches its stored hash", async () => {
    const { proposal } = await mk({ chargeId: "ch_2", amount: 500 });
    await env.DB.prepare("UPDATE proposals SET payload_json = ? WHERE id = ?").bind('{"chargeId":"ch_2","amount":50000}', proposal.id).run();
    const tampered = (await getProposal(env, proposal.id))!;
    expect(await checkHash(tampered, tampered.payloadHash)).toBe("tampered");
    await expect(decide(env, proposal.id, "approve", tampered.payloadHash, async () => {})).rejects.toMatchObject({ code: "payload_tampered" });
  });
  it("approve with the right hash moves to executing, then done with the result", async () => {
    const { proposal } = await mk({ chargeId: "ch_3", amount: 900 });
    const out = await decide(env, proposal.id, "approve", proposal.payloadHash, async (id) => executeProposal(env, id));
    expect(out.status).toBe("done");
    expect(out.result).toEqual({ ok: true, detail: "ran", url: null });
    await expect(decide(env, proposal.id, "approve", proposal.payloadHash, async () => {})).rejects.toMatchObject({ code: "not_pending" });
  });
  it("dedupes identical pending proposals and blocks approval until dependsOn is done", async () => {
    const a = await mk({ chargeId: "ch_4", amount: 100 });
    const b = await mk({ chargeId: "ch_4", amount: 100 });
    expect(b.created).toBe(false);
    expect(b.proposal.id).toBe(a.proposal.id);
    const dep = await createProposal(env, { agent: "revenue", kind: "stripe_refund", title: "Second", why: "w", payload: { n: 2 }, level: "week", dependsOn: a.proposal.id });
    await expect(decide(env, dep.proposal.id, "approve", dep.proposal.payloadHash, async () => {})).rejects.toMatchObject({ code: "dependency_pending" });
  });
});
