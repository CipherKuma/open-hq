import { LiveEvent } from "@open-hq/shared";
import type { LiveState } from "./types";

// WebSocket to /api/live with exponential backoff (1s → 30s, jittered). Invalid frames are dropped.
export function connectLiveSocket(onEvent: (e: LiveEvent) => void, onState: (s: LiveState) => void): () => void {
  let ws: WebSocket | null = null;
  let attempt = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  const open = () => {
    if (stopped) return;
    onState("connecting");
    const proto = location.protocol === "https:" ? "wss" : "ws";
    try {
      ws = new WebSocket(`${proto}://${location.host}/api/live`);
    } catch {
      schedule();
      return;
    }
    ws.onopen = () => { attempt = 0; onState("open"); };
    ws.onmessage = (msg) => {
      try {
        const parsed = LiveEvent.safeParse(JSON.parse(String(msg.data)));
        if (parsed.success) onEvent(parsed.data);
      } catch { /* non-JSON keepalive frames are ignored */ }
    };
    ws.onclose = () => { onState("closed"); schedule(); };
    ws.onerror = () => { ws?.close(); };
  };

  const schedule = () => {
    if (stopped || timer) return;
    const base = Math.min(30000, 1000 * 2 ** attempt);
    attempt += 1;
    timer = setTimeout(() => { timer = null; open(); }, base / 2 + Math.random() * (base / 2));
  };

  const onVisible = () => {
    if (document.visibilityState === "visible" && (!ws || ws.readyState === WebSocket.CLOSED)) {
      if (timer) { clearTimeout(timer); timer = null; }
      attempt = 0;
      open();
    }
  };
  document.addEventListener("visibilitychange", onVisible);
  open();

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    document.removeEventListener("visibilitychange", onVisible);
    if (ws) { ws.onclose = null; ws.close(); }
  };
}
