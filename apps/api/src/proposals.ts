// Approval flow: a decision must quote the payloadHash the founder was shown; only then does the runner execute.
import type { Proposal } from "@open-hq/shared";
import type { Env } from "./env";
import { execute as integrationsExecute } from "./integrations";
import { logActivity } from "./store/activity";
import { getProposal, setStatus } from "./store/proposals";
import { ApiErr, errMessage, payloadHashOf } from "./util";
import { nowIso, uid } from "./util";

export type HashCheck = "ok" | "mismatch" | "tampered";

/** Pure check: `submitted` must equal the stored hash, and the stored hash must still match the stored payload. */
export async function checkHash(p: Pick<Proposal, "payload" | "payloadHash">, submitted: string): Promise<HashCheck> {
  if ((await payloadHashOf(p.payload)) !== p.payloadHash) return "tampered";
  return submitted === p.payloadHash ? "ok" : "mismatch";
}

export async function decide(
  env: Env, id: string, decision: "approve" | "decline", payloadHash: string, startExecution: (id: string) => Promise<void>,
): Promise<Proposal> {
  const p = await getProposal(env, id);
  if (!p) throw new ApiErr(404, "Proposal not found", "not_found");
  if (p.status !== "pending") throw new ApiErr(409, `Proposal is already ${p.status}`, "not_pending");
  const check = await checkHash(p, payloadHash);
  if (check === "tampered") throw new ApiErr(409, "Stored proposal no longer matches its hash; refusing to run it", "payload_tampered");
  if (check === "mismatch") throw new ApiErr(409, "The action changed since you looked at it; reload and review again", "hash_mismatch");

  if (decision === "decline") {
    await setStatus(env, id, ["pending"], "declined");
    await logActivity(env, { agent: p.agent, kind: "proposal", summary: `Declined: ${p.title}`, runtime: "app" });
    return (await getProposal(env, id))!;
  }
  if (p.dependsOn) {
    const dep = await getProposal(env, p.dependsOn);
    if (dep && dep.status !== "done") throw new ApiErr(409, `Waiting on "${dep.title}" (${dep.status}) first`, "dependency_pending");
  }
  if (!(await setStatus(env, id, ["pending"], "executing"))) throw new ApiErr(409, "Proposal was just decided elsewhere", "not_pending");
  await logActivity(env, { agent: p.agent, kind: "proposal", summary: `Approved: ${p.title}`, runtime: "app" });
  await startExecution(id);
  return (await getProposal(env, id))!;
}

/** Runs an approved (executing) proposal. memory/standing_order are applied locally; everything else goes to integrations. */
export async function executeProposal(env: Env, id: string): Promise<void> {
  const p = await getProposal(env, id);
  if (!p || p.status !== "executing") return;
  const started = Date.now();
  let result: NonNullable<Proposal["result"]>;
  try {
    if (p.kind === "memory" || p.kind === "standing_order") result = await applyLocal(env, p);
    else result = await integrationsExecute(p, env);
  } catch (e) {
    result = { ok: false, detail: errMessage(e).slice(0, 400), url: null };
  }
  await setStatus(env, id, ["executing"], result.ok ? "done" : "failed", result);
  await logActivity(env, {
    agent: p.agent, kind: "execution", runtime: "app", ms: Date.now() - started,
    summary: `${result.ok ? "Done" : "Failed"}: ${p.title}`, detail: result.detail,
  });
}

async function applyLocal(env: Env, p: Proposal): Promise<NonNullable<Proposal["result"]>> {
  const text = String(p.payload.text ?? "").trim();
  if (!text) return { ok: false, detail: "Proposal payload has no text", url: null };
  const table = p.kind === "memory" ? "memories" : "standing_orders";
  const stmt = p.kind === "memory"
    ? env.DB.prepare("INSERT INTO memories (id, agent, text, source, created_at) VALUES (?,?,?,?,?)")
        .bind(uid("mem"), p.agent, text, String(p.payload.source ?? "approved proposal"), nowIso())
    : env.DB.prepare("INSERT INTO standing_orders (id, agent, text, created_at) VALUES (?,?,?,?)")
        .bind(uid("so"), p.agent, text, nowIso());
  await stmt.run();
  return { ok: true, detail: `Saved to ${p.agent}'s ${table === "memories" ? "memory" : "standing orders"}`, url: null };
}
