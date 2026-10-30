import type { Env } from "./env";
import { ApiErr } from "./util";

/** Per-IP fixed-window limiter backed by D1. Throws 429 when the window's count exceeds `max`. */
export async function rateLimit(env: Env, ip: string, bucket: string, max: number, windowSec: number): Promise<void> {
  const window = Math.floor(Date.now() / 1000 / windowSec);
  const key = `${bucket}:${ip}:${window}`;
  const row = await env.DB.prepare(
    "INSERT INTO rate_limits (key, count, expires_at) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = count + 1 RETURNING count",
  ).bind(key, (window + 2) * windowSec).first<{ count: number }>();
  if ((row?.count ?? 1) > max) throw new ApiErr(429, "Too many requests, slow down", "rate_limited");
}

export async function pruneRateLimits(env: Env): Promise<void> {
  await env.DB.prepare("DELETE FROM rate_limits WHERE expires_at < ?").bind(Math.floor(Date.now() / 1000)).run();
}
