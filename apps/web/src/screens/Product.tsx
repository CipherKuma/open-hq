import type { ReactNode } from "react";
import { NavLink, useParams } from "react-router-dom";
import type { AgentId, Dashboard } from "@open-hq/shared";
import { useDashboard, useWorkspace } from "../lib/queries";
import { Icon } from "../components/Icon";
import { Mark } from "../components/Mark";
import { Sparkline } from "../components/Sparkline";
import { Empty, ErrorState, Skeleton } from "../components/States";
import { fmtDayTime } from "../lib/time";

const usd = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const DEPLOY = { ok: { tone: "ok", label: "healthy" }, failed: { tone: "bad", label: "failed" }, rolled_back: { tone: "warn", label: "rolled back" } } as const;

function Delta({ v, unit = "", invert }: { v: number; unit?: string; invert?: boolean }) {
  const good = invert ? v < 0 : v > 0;
  const cls = v === 0 ? "flat" : good ? "up" : "down";
  return <span className={`delta ${cls}`}>{v > 0 ? "+" : v < 0 ? "−" : "±"}{Math.abs(v).toLocaleString("en-US")}{unit}</span>;
}

function Kpi({ title, agent, value, extra, source, children }: { title: string; agent: AgentId; value: ReactNode; extra?: ReactNode; source?: string; children?: ReactNode }) {
  return (
    <section className="card kpi">
      <div className="kpi-h"><span className="eyebrow">{title}</span><Mark id={agent} size="xs" /></div>
      <div className="row wrap" style={{ alignItems: "baseline" }}><span className="kpi-v">{value}</span>{extra}</div>
      {children}
      <div className="src"><Icon name="link" /><span>{source ?? "Source not reported"}</span></div>
    </section>
  );
}

function Board({ d }: { d: Dashboard }) {
  const s = d.source;
  return (
    <>
      <div className="kpis">
        <Kpi title="MRR" agent="revenue" value={usd(d.mrr.value)} extra={<Delta v={d.mrr.delta} unit=" today" />} source={s.mrr}>
          <Sparkline points={d.mrr.series} color="var(--a-revenue)" label="MRR, last 30 days" />
        </Kpi>
        <Kpi title="Paying customers" agent="revenue" value={d.customers.value} extra={<Delta v={d.customers.delta} unit=" today" />} source={s.customers} />
        <Kpi title="Failed payments" agent="revenue" value={d.failedPayments} extra={<span className={`pill ${d.failedPayments ? "warn" : "ok"}`}>{d.failedPayments ? "needs a retry" : "none"}</span>} source={s.failedPayments} />
        <Kpi title="Error rate" agent="ship" value={<>{d.errorRate.value.toFixed(2)}<small>%</small></>} source={s.errorRate}>
          <Sparkline points={d.errorRate.series} color="var(--a-ship)" label="Error rate, last 30 days" />
        </Kpi>
        <Kpi title="Open tickets" agent="support" value={d.openTickets} source={s.openTickets} />
        <Kpi title="Traffic" agent="scout" value={d.traffic.value.toLocaleString("en-US")} extra={<Delta v={d.traffic.delta} unit="% WoW" />} source={s.traffic}>
          <Sparkline points={d.traffic.series} color="var(--a-scout)" label="Visits, last 30 days" />
        </Kpi>
      </div>
      <section className="card">
        <div className="card-h"><h2>Deploys</h2><Mark id="ship" size="xs" /></div>
        {d.deploys.length === 0 ? <p className="small muted">No deploys recorded yet.</p> : (
          <ul className="deploys">
            {d.deploys.map((x) => (
              <li key={x.id}>
                <span className={`pill ${DEPLOY[x.state].tone}`}>{DEPLOY[x.state].label}</span>
                <span className="ellipsis">{x.ref}</span>
                <span className="mono tiny muted">{fmtDayTime(x.at)}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="src"><Icon name="link" /><span>{s.deploys ?? "Source not reported"}</span></div>
      </section>
    </>
  );
}

export function ProductScreen() {
  const { id = "" } = useParams();
  const ws = useWorkspace();
  const q = useDashboard(id);
  const product = ws.data?.products.find((p) => p.id === id) ?? q.data?.product;
  return (
    <div className="page">
      {ws.data && ws.data.products.length > 1 ? (
        <nav className="tabs" aria-label="Products">
          {ws.data.products.map((p) => <NavLink key={p.id} to={`/products/${p.id}`} className={({ isActive }) => (isActive ? "active" : "")}>{p.name}</NavLink>)}
        </nav>
      ) : null}
      <div className="page-h">
        <div>
          <span className="eyebrow lamp">Product</span>
          <h1>{product?.name ?? (q.isPending ? "Loading…" : "Product")}</h1>
          {product ? <p className="lede">{product.tagline} · <a href={product.url} target="_blank" rel="noreferrer">{product.url.replace(/^https?:\/\//, "")}</a></p> : null}
        </div>
      </div>
      {q.isPending ? (
        <div className="kpis" role="status" aria-label="Loading dashboard">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} h={150} r={14} />)}</div>
      ) : q.isError ? (
        (q.error as { status?: number }).status === 404
          ? <Empty title="No product with that name" icon="box">Pick one of your products from the list.</Empty>
          : <ErrorState error={q.error} onRetry={() => void q.refetch()} title="Couldn't load this dashboard" />
      ) : <Board d={q.data} />}
    </div>
  );
}
