// LiveHub: one Durable Object holding every browser WebSocket (hibernation API) and fanning out LiveEvents.
import { DurableObject } from "cloudflare:workers";
import type { LiveEvent } from "@open-hq/shared";
import type { Env } from "./env";

export class LiveHub extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  async fetch(req: Request): Promise<Response> {
    if (req.headers.get("Upgrade") !== "websocket") return new Response("expected websocket", { status: 426 });
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  async broadcast(payload: string): Promise<number> {
    let sent = 0;
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(payload);
        sent++;
      } catch {
        /* socket is gone; hibernation cleanup closes it */
      }
    }
    return sent;
  }

  webSocketMessage(): void {
    /* clients only listen */
  }

  webSocketClose(ws: WebSocket): void {
    try {
      ws.close();
    } catch {
      /* already closed */
    }
  }
}

const hub = (env: Env) => env.LIVE.get(env.LIVE.idFromName("main"));

export async function broadcast(env: Env, event: LiveEvent): Promise<void> {
  if (!env.LIVE) return;
  try {
    await hub(env).broadcast(JSON.stringify(event));
  } catch {
    /* live push is best effort; the write already succeeded */
  }
}

export function connectLive(env: Env, req: Request): Promise<Response> {
  return hub(env).fetch(req);
}
