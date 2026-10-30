// github_revert: open a pull request that undoes one commit, using only the git-data write tools.
// Strategy: restore every file the commit touched to its parent's version on top of the base branch head.
import { write } from "./writes";
import type { IntegrationsEnv } from "./env";
import type { GithubRevert } from "./payloads";
import type { ExecResult } from "./types";

export async function githubRevert(env: IntegrationsEnv, p: GithubRevert): Promise<ExecResult> {
  const { owner, repo } = p;
  const base = await write(env, "GITHUB_GET_A_BRANCH", { owner, repo, branch: p.baseBranch });
  const headSha: string = base?.commit?.sha;
  const headTree: string = base?.commit?.commit?.tree?.sha;
  const target = await write(env, "GITHUB_GET_A_COMMIT", { owner, repo, ref: p.sha });
  if (!headSha || !headTree || !target?.sha) return { ok: false, detail: "Could not read the branch or commit from GitHub", url: null };
  if ((target.parents ?? []).length !== 1) return { ok: false, detail: "Only single-parent commits can be reverted automatically", url: null };
  const parentSha: string = target.parents[0].sha;
  const parent = await write(env, "GITHUB_GET_A_COMMIT", { owner, repo, ref: parentSha });
  const parentTreeSha: string = parent?.commit?.tree?.sha;
  const files: any[] = target.files ?? [];
  if (!files.length) return { ok: false, detail: "That commit changes no files", url: null };

  const treeRes = await write(env, "GITHUB_GET_A_TREE", { owner, repo, tree_sha: parentTreeSha, recursive: "1" });
  const parentEntries = new Map<string, { sha: string; mode: string }>();
  for (const t of treeRes?.tree ?? []) if (t.type === "blob") parentEntries.set(t.path, { sha: t.sha, mode: t.mode });

  const entries: Array<Record<string, unknown>> = [];
  for (const f of files) {
    const path: string = f.filename;
    if (f.status === "added") entries.push({ path, mode: "100644", type: "blob", sha: null });
    else if (f.status === "renamed") {
      entries.push({ path, mode: "100644", type: "blob", sha: null });
      const old = parentEntries.get(f.previous_filename);
      if (old) entries.push({ path: f.previous_filename, mode: old.mode, type: "blob", sha: old.sha });
    } else {
      const old = parentEntries.get(path);
      if (old) entries.push({ path, mode: old.mode, type: "blob", sha: old.sha });
    }
  }
  const tree = await write(env, "GITHUB_CREATE_A_TREE", { owner, repo, base_tree: headTree, tree: entries });
  const subject = String(target.commit?.message ?? p.sha).split("\n")[0];
  const message = `Revert "${subject}"\n\nThis reverts commit ${target.sha}.${p.reason ? `\n\nReason: ${p.reason}` : ""}`;
  const commit = await write(env, "GITHUB_CREATE_A_COMMIT", { owner, repo, message, tree: tree.sha, parents: [headSha] });
  const branch = `revert-${String(target.sha).slice(0, 7)}`;
  await write(env, "GITHUB_CREATE_A_REFERENCE", { owner, repo, ref: `refs/heads/${branch}`, sha: commit.sha });
  const pr = await write(env, "GITHUB_CREATE_A_PULL_REQUEST", {
    owner, repo, head: branch, base: p.baseBranch,
    title: `Revert "${subject}"`,
    body: `Opened by Open HQ (Ship) after founder approval.\n\nReverts ${target.sha}.${p.reason ? `\n\n${p.reason}` : ""}`,
  });
  return { ok: true, detail: `Opened revert PR #${pr.number} for ${String(target.sha).slice(0, 7)}`, url: pr.html_url ?? null };
}
