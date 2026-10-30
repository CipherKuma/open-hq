import type { Context } from "hono";
import type { z } from "zod";
import type { Env } from "./env";
import { ApiErr } from "./util";

export type AppCtx = Context<{ Bindings: Env }>;

export function parse<S extends z.ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const r = schema.safeParse(data);
  if (!r.success) {
    const i = r.error.issues[0];
    throw new ApiErr(400, `${i?.path.join(".") || "body"}: ${i?.message ?? "invalid"}`, "invalid_input");
  }
  return r.data;
}

export async function jsonBody<S extends z.ZodTypeAny>(c: AppCtx, schema: S): Promise<z.infer<S>> {
  const raw = await c.req.json().catch(() => {
    throw new ApiErr(400, "Body must be JSON", "invalid_json");
  });
  return parse(schema, raw);
}

export const clientIp = (c: AppCtx): string => c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
