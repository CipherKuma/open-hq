import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { Rail } from "./Rail";
import { Icon } from "../components/Icon";
import { useChannels, useProposals } from "../lib/queries";

function titleFor(path: string) {
  if (path === "/") return "Tonight";
  if (path.startsWith("/chat")) return "Chat";
  if (path.startsWith("/decisions")) return "Decisions";
  if (path.startsWith("/products")) return "Product";
  if (path.startsWith("/agents")) return "Agent";
  if (path.startsWith("/connections")) return "Connections";
  if (path.startsWith("/schedule")) return "Schedule";
  if (path.startsWith("/activity")) return "Activity log";
  return "Open HQ";
}

export function Shell() {
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const unread = useChannels().data?.reduce((n, c) => n + c.unread, 0) ?? 0;
  const pending = useProposals().data?.filter((p) => p.status === "pending").length ?? 0;
  const flush = loc.pathname.startsWith("/chat/");

  useEffect(() => { setOpen(false); }, [loc.pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className={`app ${flush ? "is-thread" : ""}`}>
      <a href="#main" className="sr-only">Skip to content</a>
      <Rail open={open} />
      <div className={`scrim ${open ? "open" : ""}`} onClick={() => setOpen(false)} aria-hidden="true" />
      <header className="topbar">
        <button className="btn ghost icon" onClick={() => setOpen(true)} aria-label="Open navigation" aria-expanded={open}><Icon name="menu" /></button>
        <span className="title">{titleFor(loc.pathname)}</span>
      </header>
      <main id="main" className={`main ${flush ? "flush" : ""}`} tabIndex={-1}>
        <Outlet />
      </main>
      <nav className="bottombar" aria-label="Primary">
        <NavLink to="/" end className={({ isActive }) => (isActive ? "active" : "")}><Icon name="lamp" />Tonight</NavLink>
        <NavLink to="/chat" className={({ isActive }) => (isActive ? "active" : "")}><Icon name="chat" />Chat{unread ? <span className="count hot">{unread}</span> : null}</NavLink>
        <NavLink to="/decisions" className={({ isActive }) => (isActive ? "active" : "")}><Icon name="check" />Decisions{pending ? <span className="count hot">{pending}</span> : null}</NavLink>
        <NavLink to="/activity" className={({ isActive }) => (isActive ? "active" : "")}><Icon name="pulse" />Activity</NavLink>
        <button type="button" onClick={() => setOpen(true)}><Icon name="more" />More</button>
      </nav>
    </div>
  );
}
