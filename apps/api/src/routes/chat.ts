import { CreateGroup, PostMessage } from "@open-hq/shared";
import { Hono } from "hono";
import { z } from "zod";
import { handleFounderMessage } from "../chat";
import type { Env } from "../env";
import { jsonBody, parse } from "../http";
import { createGroup, getChannel, listChannels, markRead } from "../store/channels";
import { listMessages } from "../store/messages";
import { ApiErr } from "../util";

export const chatRoutes = new Hono<{ Bindings: Env }>();

chatRoutes.get("/api/channels", async (c) => c.json(await listChannels(c.env)));

chatRoutes.get("/api/channels/:id/messages", async (c) => {
  const id = c.req.param("id");
  const q = parse(z.object({ before: z.string().datetime().optional(), peek: z.string().optional() }), c.req.query());
  const ch = await getChannel(c.env, id);
  if (!ch) throw new ApiErr(404, "Channel not found", "not_found");
  const msgs = await listMessages(c.env, id, q.before ?? null, 100);
  if (!q.peek && ch.kind !== "backroom") await markRead(c.env, id);
  return c.json(msgs);
});

chatRoutes.post("/api/channels/:id/messages", async (c) => {
  const { text } = await jsonBody(c, PostMessage);
  return c.json(await handleFounderMessage(c.env, c.req.param("id"), text.trim()), 201);
});

chatRoutes.post("/api/groups", async (c) => {
  const g = await jsonBody(c, CreateGroup);
  return c.json(await createGroup(c.env, g.name.trim(), g.agents), 201);
});
