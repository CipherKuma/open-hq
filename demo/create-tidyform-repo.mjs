#!/usr/bin/env node
// Creates the public GitHub repo CipherKuma/tidyform and pushes demo/tidyform/ to it.
// The git work happens in a temp directory (not inside open-hq) so no nested .git lands in this repo.
// Requires CIPHERKUMA_GITHUB_PAT (vault). Refuses to push unless every commit is authored by CipherKuma.
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv, need } from "./lib.mjs";

loadEnv();
const pat = need("CIPHERKUMA_GITHUB_PAT");
const OWNER = "CipherKuma";
const REPO = "tidyform";
const NAME = "CipherKuma";
const EMAIL = "jedionchain@gmail.com";
const gh = (path, init = {}) =>
  fetch(`https://api.github.com${path}`, { ...init, headers: { authorization: `Bearer ${pat}`, accept: "application/vnd.github+json", "user-agent": "openhq-demo", ...(init.headers ?? {}) } });

const me = await (await gh("/user")).json();
if (me.login !== OWNER) {
  process.stderr.write(`Token belongs to "${me.login}", expected ${OWNER}. Aborting.\n`);
  process.exit(1);
}
const exists = (await gh(`/repos/${OWNER}/${REPO}`)).status === 200;
if (!exists) {
  const res = await gh("/user/repos", {
    method: "POST",
    body: JSON.stringify({ name: REPO, description: "Tidyform: a form backend for indie sites. Demo product for Open HQ.", private: false, has_issues: true }),
  });
  if (res.status !== 201) { process.stderr.write(`Repo creation failed (${res.status})\n`); process.exit(1); }
  process.stdout.write(`created ${OWNER}/${REPO}\n`);
} else process.stdout.write(`${OWNER}/${REPO} already exists\n`);

const work = mkdtempSync(join(tmpdir(), "openhq-tidyform-"));
const basic = Buffer.from(`x-access-token:${pat}`).toString("base64");
const authEnv = { GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "http.https://github.com/.extraheader", GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${basic}` };
const idEnv = { GIT_AUTHOR_NAME: NAME, GIT_AUTHOR_EMAIL: EMAIL, GIT_COMMITTER_NAME: NAME, GIT_COMMITTER_EMAIL: EMAIL };
const git = (args, extra = {}, cwd = work) =>
  execFileSync("git", ["-c", `user.name=${NAME}`, "-c", `user.email=${EMAIL}`, "-c", "commit.gpgsign=false", ...args], {
    cwd, env: { ...process.env, ...idEnv, ...extra }, encoding: "utf8",
  });

// Start from the remote (if it has commits) so re-runs add a commit instead of rewriting history.
const hasCommits = exists && (await (await gh(`/repos/${OWNER}/${REPO}/commits?per_page=1`)).json()).length > 0;
if (hasCommits) {
  git(["clone", `https://github.com/${OWNER}/${REPO}.git`, "."], authEnv);
  for (const f of readdirSync(work)) if (f !== ".git") rmSync(join(work, f), { recursive: true, force: true });
} else {
  git(["init", "-b", "main"]);
  git(["remote", "add", "origin", `https://github.com/${OWNER}/${REPO}.git`]);
}
cpSync(fileURLToPath(new URL("./tidyform", import.meta.url)), work, { recursive: true, filter: (s) => !/node_modules|\.wrangler|\.build|\.dev\.vars|\/dist(\/|$)|\.git(\/|$)/.test(s) });
git(["add", "-A"]);
if (!git(["status", "--porcelain"]).trim()) {
  process.stdout.write("nothing to commit; repo is up to date\n");
  rmSync(work, { recursive: true, force: true });
  process.exit(0);
}
git(["commit", "-m", process.env.COMMIT_MESSAGE || (hasCommits ? "Tidyform: deploy to Pages, contact form delivers through Gmail" : "Tidyform: landing, pricing, checkout and form endpoint")]);

const log = git(["log", "--format=%an <%ae>|%cn <%ce>"]).trim().split("\n");
const expected = `${NAME} <${EMAIL}>|${NAME} <${EMAIL}>`;
const bad = log.filter((l) => l !== expected);
if (bad.length) {
  process.stderr.write(`Unexpected commit identity in git log: ${bad.join(" ; ")}. Not pushing.\n`);
  process.exit(1);
}
process.stdout.write(`git log identities OK (${log.length} commits)\n`);
git(["push", "-u", "origin", "main"], authEnv);
rmSync(work, { recursive: true, force: true });
process.stdout.write(`pushed: https://github.com/${OWNER}/${REPO}\n`);
