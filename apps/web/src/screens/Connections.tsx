import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import type { Connection } from "@open-hq/shared";
import { api } from "../api";
import { useConnections } from "../lib/queries";
import { Icon } from "../components/Icon";
import { Marks } from "../components/Mark";
import { Empty, ErrorState, Skeleton, errorText } from "../components/States";
import { ago } from "../lib/time";

export const PIPELINES: { id: Connection["pipeline"]; label: string }[] = [
  { id: "build", label: "Build" }, { id: "ship", label: "Ship and run" }, { id: "money", label: "Money" },
  { id: "support", label: "Support" }, { id: "growth", label: "Growth and analytics" }, { id: "comms", label: "Email, calendar and alerts" },
];
const STATUS: Record<Connection["status"], { tone: string; label: string }> = {
  connected: { tone: "ok", label: "connected" }, available: { tone: "line", label: "one click" },
  needs_app: { tone: "warn", label: "needs OAuth app" }, direct: { tone: "info", label: "built directly" },
};

// Opens Composio's hosted sign-in. The tab is opened synchronously so popup blockers allow it.
export function useLink() {
  const [note, setNote] = useState<{ toolkit: string; url: string } | null>(null);
  const m = useMutation({
    mutationFn: async (toolkit: string) => {
      const tab = api.mode === "live" ? window.open("about:blank", "_blank") : null;
      try {
        const { redirectUrl } = await api.link(toolkit);
        if (tab) tab.location.href = redirectUrl;
        else if (api.mode === "live") window.location.assign(redirectUrl);
        else setNote({ toolkit, url: redirectUrl });
      } catch (e) { tab?.close(); throw e; }
    },
  });
  return { link: m.mutate, pending: m.isPending ? m.variables : null, error: m.error, failed: m.isError ? m.variables : null, note };
}

export function ConnectionRow({ c, l }: { c: Connection; l: ReturnType<typeof useLink> }) {
  const s = STATUS[c.status];
  return (
    <li className="conn">
      <div className="conn-main">
        <div className="row wrap"><b>{c.name}</b><span className={`pill ${s.tone}`}>{s.label}</span></div>
        <div className="conn-sub">
          {c.account ? <span className="mono tiny">{c.account}</span> : null}
          {c.status === "connected" ? <span className="mono tiny muted">last read {ago(c.lastReadAt)}</span> : null}
          {c.readTools.length ? <span className="tiny muted" title={c.readTools.join(", ")}>{c.readTools.length} read tools</span> : null}
        </div>
        {l.failed === c.toolkit && l.error ? <span className="tiny bad-text" role="alert">{errorText(l.error)}</span> : null}
        {l.note?.toolkit === c.toolkit ? <span className="tiny muted">Demo data: the live app opens <span className="mono">{l.note.url}</span></span> : null}
      </div>
      <Marks ids={c.agents} size="xs" />
      {c.status === "direct" ? (
        <span className="tiny muted conn-act">after launch</span>
      ) : (
        <button className={`btn sm conn-act ${c.status === "connected" ? "ghost" : ""}`} onClick={() => l.link(c.toolkit)} disabled={l.pending === c.toolkit}>
          {l.pending === c.toolkit ? <span className="spin" /> : null}{c.status === "connected" ? "Reconnect" : "Connect"}
        </button>
      )}
    </li>
  );
}

export function Connections() {
  const q = useConnections();
  const l = useLink();
  return (
    <div className="page">
      <div className="page-h">
        <div>
          <span className="eyebrow lamp">Every connection, grouped by pipeline</span>
          <h1>Connections</h1>
          <p className="lede">Composio handles each sign-in. Agents get only read tools for their own apps; refunds, replies and rollbacks run in the approval runner after you approve.</p>
        </div>
      </div>
      <div className="chips">
        {Object.values(STATUS).map((s) => <span key={s.label} className={`pill ${s.tone}`}>{s.label}</span>)}
      </div>
      {q.isPending ? (
        <div className="grid3" role="status" aria-label="Loading connections">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} h={200} r={14} />)}</div>
      ) : q.isError ? <ErrorState error={q.error} onRetry={() => void q.refetch()} title="Couldn't load connections" /> : q.data.length === 0 ? (
        <Empty title="No connections in the catalog" icon="plug">The API returned an empty catalog. Check the Composio key on the Worker.</Empty>
      ) : (
        <div className="cat">
          {PIPELINES.map((p) => {
            const rows = q.data.filter((c) => c.pipeline === p.id).sort((a, b) => Number(b.status === "connected") - Number(a.status === "connected"));
            if (!rows.length) return null;
            const agents = [...new Set(rows.flatMap((r) => r.agents))];
            const live = rows.filter((r) => r.status === "connected").length;
            return (
              <section key={p.id} className="card">
                <div className="card-h"><h2>{p.label}</h2><Marks ids={agents} size="xs" /></div>
                <span className="mono tiny muted">{live} of {rows.length} connected</span>
                <ul className="conns">{rows.map((c) => <ConnectionRow key={c.toolkit} c={c} l={l} />)}</ul>
              </section>
            );
          })}
        </div>
      )}
      <div className="notice"><Icon name="lock" /><span>Read-only is enforced when a tool runs, not just when it's listed: each agent's Composio session allows only its own apps' read tools, with destructive tools switched off.</span></div>
    </div>
  );
}
