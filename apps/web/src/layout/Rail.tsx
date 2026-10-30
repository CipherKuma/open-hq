import { NavLink } from "react-router-dom";
import { useState } from "react";
import type { AgentId, Channel } from "@open-hq/shared";
import { Icon } from "../components/Icon";
import { Mark, Marks } from "../components/Mark";
import { useChannels, useProposals, useWorkspace } from "../lib/queries";
import { useAgentStatus, useLive } from "../live/LiveProvider";
import { AGENT_ORDER } from "../lib/agents";
import { api } from "../api";
import { NewGroupDialog } from "../screens/chat/NewGroupDialog";
import { BrandMark } from "./BrandMark";

export const chatPath = (id: string) => `/chat/${encodeURIComponent(id)}`;
const cls = ({ isActive }: { isActive: boolean }) => `rail-link ${isActive ? "active" : ""}`;

function Count({ n, hot }: { n: number; hot?: boolean }) {
  if (!n) return null;
  return <span className={`count ${hot ? "hot" : ""}`} aria-label={`${n} unread`}>{n}</span>;
}

function LiveDot() {
  const { state } = useLive();
  if (api.mode === "mock") return <span className="pill warn" title="VITE_API_MODE=mock">demo data</span>;
  const label = state === "open" ? "live" : state === "connecting" ? "connecting" : "reconnecting";
  return <span className={`pill ${state === "open" ? "ok" : "warn"}`}><span className={`dot ${state === "open" ? "live" : ""}`} />{label}</span>;
}

export function ChannelLinks({ channels }: { channels: Channel[] }) {
  const statusOf = useAgentStatus();
  const [groupOpen, setGroupOpen] = useState(false);
  const dms = AGENT_ORDER.map((a) => channels.find((c) => c.id === `dm:${a}`)).filter((c): c is Channel => !!c);
  const groups = channels.filter((c) => c.kind === "group");
  const rooms = channels.filter((c) => c.kind === "backroom").sort((a, b) => (b.lastAt ?? "").localeCompare(a.lastAt ?? ""));
  return (
    <>
      <div className="rail-sec">
        <div className="rail-sec-h">Agents</div>
        {dms.map((c) => {
          const agent = c.id.slice(3) as AgentId;
          return (
            <NavLink key={c.id} to={chatPath(c.id)} className={(p) => `${cls(p)} ${c.unread ? "unread" : ""}`}>
              <Mark id={agent} size="sm" status={statusOf(agent)} />
              <span className="label">{c.name}</span>
              <Count n={c.unread} hot />
            </NavLink>
          );
        })}
      </div>
      <div className="rail-sec">
        <div className="rail-sec-h">Groups<button type="button" onClick={() => setGroupOpen(true)} aria-label="New group"><Icon name="plus" className="ico" /></button></div>
        {groups.map((c) => (
          <NavLink key={c.id} to={chatPath(c.id)} className={(p) => `${cls(p)} ${c.unread ? "unread" : ""}`}>
            <span className="hash" aria-hidden="true">#</span>
            <span className="label">{c.name}</span>
            <Count n={c.unread} hot />
          </NavLink>
        ))}
        <button type="button" className="rail-link quiet" style={{ background: "none", border: 0, textAlign: "left" }} onClick={() => setGroupOpen(true)}>
          <Icon name="plus" /><span className="label">New group</span>
        </button>
      </div>
      <div className="rail-sec">
        <div className="rail-sec-h">Back room</div>
        {rooms.length === 0 ? <span className="rail-link quiet">No agent threads yet</span> : null}
        {rooms.map((c) => (
          <NavLink key={c.id} to={chatPath(c.id)} className={(p) => `${cls(p)} quiet`}>
            <Marks ids={c.members} size="xs" />
            <span className="label">{c.name}</span>
          </NavLink>
        ))}
      </div>
      <NewGroupDialog open={groupOpen} onClose={() => setGroupOpen(false)} />
    </>
  );
}

export function Rail({ open }: { open: boolean }) {
  const ws = useWorkspace();
  const channels = useChannels();
  const proposals = useProposals();
  const pending = proposals.data?.filter((p) => p.status === "pending").length ?? 0;
  return (
    <nav className={`rail ${open ? "open" : ""}`} aria-label="Open HQ">
      <div className="rail-head">
        <NavLink to="/" className="brand"><BrandMark />Open HQ</NavLink>
        <div className="rail-ws"><span className="ellipsis">{ws.data?.founder ?? "Workspace"}</span><LiveDot /></div>
      </div>
      <div className="rail-scroll">
        <div className="rail-sec">
          <NavLink to="/" end className={cls}><Icon name="lamp" /><span className="label">Tonight</span></NavLink>
          <NavLink to="/decisions" className={cls}><Icon name="check" /><span className="label">Decisions</span><Count n={pending} hot /></NavLink>
        </div>
        {channels.isError ? (
          <button className="rail-link quiet rail-retry" onClick={() => void channels.refetch()}><Icon name="alert" /><span className="label">Chats didn't load · retry</span></button>
        ) : channels.data ? <ChannelLinks channels={channels.data} /> : (
          <div className="rail-sec" aria-hidden="true">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="skel" style={{ height: 26, margin: "3px 8px" }} />)}</div>
        )}
        {ws.data?.products.length ? <div className="rail-sec">
          <div className="rail-sec-h">Products</div>
          {(ws.data?.products ?? []).map((p) => (
            <NavLink key={p.id} to={`/products/${p.id}`} className={cls}><Icon name="box" /><span className="label">{p.name}</span></NavLink>
          ))}
        </div> : null}
      </div>
      <div className="rail-foot">
        <NavLink to="/connections" className={cls}><Icon name="plug" /><span className="label">Connections</span></NavLink>
        <NavLink to="/schedule" className={cls}><Icon name="calendar" /><span className="label">Schedule</span></NavLink>
        <NavLink to="/activity" className={cls}><Icon name="pulse" /><span className="label">Activity log</span></NavLink>
      </div>
    </nav>
  );
}
