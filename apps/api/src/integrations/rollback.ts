// deploy_rollback and deploy history for Tidyform, which runs as the Cloudflare Pages project "tidyform".
import { IntegrationError, tidyformProject, type IntegrationsEnv } from "./env";
import type { ExecResult } from "./types";

const CF = "https://api.cloudflare.com/client/v4";

async function cf(env: IntegrationsEnv, path: string, init: RequestInit = {}): Promise<any> {
  const res = await fetch(CF + path, {
    ...init,
    headers: { authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`, "content-type": "application/json", ...(init.headers ?? {}) },
  });
  const body: any = await res.json().catch(() => null);
  if (!res.ok || body?.success === false) {
    throw new IntegrationError(String(body?.errors?.[0]?.message ?? `Cloudflare request failed (${res.status})`).slice(0, 200), "cloudflare_error");
  }
  return body.result;
}

export const haveCloudflare = (env: IntegrationsEnv) => Boolean(env.CLOUDFLARE_API_TOKEN && env.CLOUDFLARE_ACCOUNT_ID);

export interface PagesDeployment { id: string; createdAt: string; message: string; ok: boolean; live: boolean }

/** Production deployments, newest first. `live` marks the one currently serving traffic. */
export async function listDeployments(env: IntegrationsEnv, project = tidyformProject(env)): Promise<PagesDeployment[]> {
  const base = `/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/pages/projects/${project}`;
  const [proj, deps] = await Promise.all([cf(env, base), cf(env, `${base}/deployments?env=production`)]);
  const liveId = proj?.canonical_deployment?.id;
  return (deps as any[]).map((d) => ({
    id: d.id,
    createdAt: d.created_on,
    message: d.deployment_trigger?.metadata?.commit_message ?? "",
    ok: d.latest_stage?.status === "success",
    live: d.id === liveId,
  }));
}

export async function rollbackPages(env: IntegrationsEnv, p: { project?: string; deploymentId?: string }): Promise<ExecResult> {
  if (!haveCloudflare(env)) return { ok: false, detail: "Cloudflare is not connected (CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID missing)", url: null };
  const project = p.project || tidyformProject(env);
  if (project !== tidyformProject(env)) return { ok: false, detail: `Refusing to roll back ${project}: only the demo product is allowed`, url: null };
  const deps = await listDeployments(env, project);
  const live = deps.find((d) => d.live) ?? deps[0];
  const target = p.deploymentId ? deps.find((d) => d.id === p.deploymentId) : deps.filter((d) => d.ok && d.id !== live?.id && d.createdAt < (live?.createdAt ?? "~"))[0];
  if (!target) return { ok: false, detail: "No earlier successful deployment to roll back to", url: null };
  if (target.id === live?.id) return { ok: false, detail: "That deployment is already live", url: null };
  await cf(env, `/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/pages/projects/${project}/deployments/${target.id}/rollback`, { method: "POST" });
  return {
    ok: true,
    detail: `Rolled ${project} back to "${target.message || target.id.slice(0, 8)}"`,
    url: `https://dash.cloudflare.com/${env.CLOUDFLARE_ACCOUNT_ID}/pages/view/${project}/${target.id}`,
  };
}
