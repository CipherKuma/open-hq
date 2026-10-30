import { describe, expect, it, vi } from "vitest";

const calls: Array<[string, Record<string, unknown>]> = [];
vi.mock("./writes", () => ({
  write: async (_env: unknown, slug: string, args: Record<string, unknown>) => {
    calls.push([slug, args]);
    switch (slug) {
      case "GITHUB_GET_A_BRANCH": return { commit: { sha: "head111", commit: { tree: { sha: "headtree" } } } };
      case "GITHUB_GET_A_COMMIT":
        if (args.ref === "bad2222") {
          return { sha: "bad2222aaaa", parents: [{ sha: "par3333" }], commit: { message: "feat: new checkout\n\nbody" }, files: [
            { filename: "src/checkout.ts", status: "modified" }, { filename: "src/new.ts", status: "added" }, { filename: "src/b.ts", status: "renamed", previous_filename: "src/a.ts" },
          ] };
        }
        return { sha: "par3333", commit: { tree: { sha: "partree" } } };
      case "GITHUB_GET_A_TREE": return { tree: [
        { path: "src/checkout.ts", type: "blob", mode: "100644", sha: "oldcheckout" }, { path: "src/a.ts", type: "blob", mode: "100644", sha: "olda" }, { path: "src", type: "tree", mode: "040000", sha: "x" },
      ] };
      case "GITHUB_CREATE_A_TREE": return { sha: "newtree" };
      case "GITHUB_CREATE_A_COMMIT": return { sha: "revcommit" };
      case "GITHUB_CREATE_A_REFERENCE": return {};
      case "GITHUB_CREATE_A_PULL_REQUEST": return { number: 7, html_url: "https://github.com/CipherKuma/tidyform/pull/7" };
    }
    throw new Error(`unexpected ${slug}`);
  },
}));

import { githubRevert } from "./revert";

describe("githubRevert", () => {
  it("restores parent versions, deletes added files and opens a PR on top of the base head", async () => {
    const r = await githubRevert({ COMPOSIO_API_KEY: "k" }, { owner: "CipherKuma", repo: "tidyform", sha: "bad2222", baseBranch: "main" });
    expect(r).toEqual({ ok: true, detail: "Opened revert PR #7 for bad2222", url: "https://github.com/CipherKuma/tidyform/pull/7" });
    const tree = calls.find(([s]) => s === "GITHUB_CREATE_A_TREE")![1];
    expect(tree.base_tree).toBe("headtree");
    expect(tree.tree).toEqual([
      { path: "src/checkout.ts", mode: "100644", type: "blob", sha: "oldcheckout" },
      { path: "src/new.ts", mode: "100644", type: "blob", sha: null },
      { path: "src/b.ts", mode: "100644", type: "blob", sha: null },
      { path: "src/a.ts", mode: "100644", type: "blob", sha: "olda" },
    ]);
    expect(calls.find(([s]) => s === "GITHUB_CREATE_A_COMMIT")![1].parents).toEqual(["head111"]);
    expect(calls.find(([s]) => s === "GITHUB_CREATE_A_REFERENCE")![1].ref).toBe("refs/heads/revert-bad2222");
  });
});
