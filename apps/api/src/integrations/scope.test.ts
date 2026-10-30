import { afterEach, describe, expect, it, vi } from "vitest";
import { SUPPORT_QUERY } from "./allowlists";
import { scopeGmailArgs, scopeQuery } from "./gmailscope";
import { callReadTool, execute } from "./index";
import type { Proposal } from "@open-hq/shared";

const env = { COMPOSIO_API_KEY: "k", CLOUDFLARE_API_TOKEN: "t", CLOUDFLARE_ACCOUNT_ID: "acct" };
afterEach(() => vi.unstubAllGlobals());

describe("gmail scoping", () => {
  it("always includes the support query and cannot be widened", () => {
    expect(scopeQuery("")).toBe(`(${SUPPORT_QUERY})`);
    const q = scopeQuery("x ) OR (in:inbox");
    expect(q.startsWith(`(${SUPPORT_QUERY}) (`)).toBe(true);
    expect(q.slice(`(${SUPPORT_QUERY})`.length)).not.toMatch(/[(){}].*[(){}].*[(){}]/); // only the one wrapping pair remains
    expect(scopeGmailArgs("GMAIL_LIST_MESSAGES", { q: "{a b}", user_id: "other@x.com" })).toMatchObject({ user_id: "me" });
    expect((scopeGmailArgs("GMAIL_FETCH_EMAILS", {}).query as string)).toContain("tidyform-support");
  });

  function composio(listIds: string[]) {
    const sent: Array<{ slug: string; args: any }> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });
      if (url.includes("/connected_accounts")) return json({ items: [] });
      if (url.endsWith("/tool_router/session")) return json({ session_id: "s", mcp: { url: "u" } });
      if (url.endsWith("/execute")) {
        const b = JSON.parse(String(init?.body));
        sent.push({ slug: b.tool_slug, args: b.arguments });
        if (b.tool_slug === "GMAIL_LIST_THREADS") return json({ data: { threads: listIds.map((id) => ({ id })) }, successful: true });
        return json({ data: { messages: [] }, successful: true });
      }
      return new Response("{}", { status: 404 });
    }));
    return sent;
  }

  it("forces the query on agent reads", async () => {
    const sent = composio([]);
    await callReadTool("support", "GMAIL_FETCH_EMAILS", { query: "from:ceo@bank.com", max_results: 3 }, env);
    expect(sent[0].args.query).toContain(SUPPORT_QUERY);
    expect(sent[0].args.query).toContain("from:ceo@bank.com");
    expect(sent[0].args.user_id).toBe("me");
  });
  it("rejects by-id reads outside the scope without fetching the message", async () => {
    const sent = composio(["aaaaaaaaaaaaaaaa"]);
    await expect(callReadTool("support", "GMAIL_FETCH_MESSAGE_BY_THREAD_ID", { thread_id: "bbbbbbbbbbbbbbbb" }, env)).rejects.toMatchObject({ code: "out_of_scope" });
    expect(sent.map((s) => s.slug)).toEqual(["GMAIL_LIST_THREADS"]);
    await callReadTool("support", "GMAIL_FETCH_MESSAGE_BY_THREAD_ID", { thread_id: "aaaaaaaaaaaaaaaa" }, env);
    expect(sent.at(-1)?.slug).toBe("GMAIL_FETCH_MESSAGE_BY_THREAD_ID");
  });
  it("support no longer has label listing", async () => {
    await expect(callReadTool("support", "GMAIL_LIST_LABELS", {}, env)).rejects.toMatchObject({ code: "tool_not_allowed" });
  });
});

describe("deploy_rollback (Cloudflare Pages)", () => {
  const p = (payload: Record<string, unknown>): Proposal => ({ id: "p", agent: "ship", productId: "tidyform", kind: "deploy_rollback", title: "t", why: "w", payload, payloadHash: "h", status: "approved", level: "urgent", createdAt: "", decidedAt: "", result: null, dependsOn: null });
  const stub = (deps: any[], liveId: string) => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${url.replace("https://api.cloudflare.com/client/v4", "")}`);
      const res = (result: unknown) => new Response(JSON.stringify({ success: true, result }), { status: 200 });
      if (url.includes("/deployments/") && url.endsWith("/rollback")) return res({});
      if (url.includes("/deployments")) return res(deps);
      return res({ canonical_deployment: { id: liveId } });
    }));
    return calls;
  };
  const dep = (id: string, at: string, msg: string, status = "success") => ({ id, created_on: at, deployment_trigger: { metadata: { commit_message: msg } }, latest_stage: { status } });
  const A = "11111111-1111-4111-8111-111111111111", B = "22222222-2222-4222-8222-222222222222";

  it("rolls back to the last good deployment before the live one", async () => {
    const calls = stub([dep(B, "2026-10-30T12:00:00Z", "Release v1.1.0"), dep(A, "2026-10-30T10:00:00Z", "Release v1.0.0")], B);
    const r = await execute(p({}), env);
    expect(r.ok).toBe(true);
    expect(r.detail).toContain("Release v1.0.0");
    expect(calls).toContain(`POST /accounts/acct/pages/projects/tidyform/deployments/${A}/rollback`);
  });
  it("refuses other projects and reports nothing to roll back to", async () => {
    stub([dep(A, "2026-10-30T10:00:00Z", "Release v1.0.0")], A);
    expect((await execute(p({ project: "probity" }), env)).ok).toBe(false);
    expect((await execute(p({}), env)).detail).toMatch(/No earlier/);
  });
});
