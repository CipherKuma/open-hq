import type { ReactNode } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import { Icon } from "./Icon";
import { ApiRequestError } from "../api";

export function Skeleton({ h = 16, w = "100%", r }: { h?: number; w?: number | string; r?: number }) {
  return <div className="skel" style={{ height: h, width: w, borderRadius: r }} aria-hidden="true" />;
}

export function LoadingBlock({ rows = 3, label = "Loading" }: { rows?: number; label?: string }) {
  return (
    <div className="stack" role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, i) => <Skeleton key={i} h={i === 0 ? 22 : 54} w={i === 0 ? "40%" : "100%"} />)}
    </div>
  );
}

export function Empty({ title, children, icon = "inbox", action, compact }: { title: string; children?: ReactNode; icon?: string; action?: ReactNode; compact?: boolean }) {
  return (
    <div className={`state ${compact ? "compact" : ""}`}>
      <Icon name={icon} />
      <h3>{title}</h3>
      {children ? <p>{children}</p> : null}
      {action}
    </div>
  );
}

export function errorText(err: unknown) {
  if (err instanceof ApiRequestError) return err.message;
  if (err instanceof Error) return err.message;
  return "Something went wrong.";
}

export function ErrorState({ error, onRetry, title = "Couldn't load this", compact }: { error: unknown; onRetry?: () => void; title?: string; compact?: boolean }) {
  return (
    <div className={`state error ${compact ? "compact" : ""}`} role="alert">
      <Icon name="alert" />
      <h3>{title}</h3>
      <p>{errorText(error)}</p>
      {onRetry ? <button className="btn sm" onClick={onRetry}><Icon name="refresh" />Try again</button> : null}
    </div>
  );
}

// Renders loading / error / data for one query; screens pass their own skeleton when the shape matters.
export function Query<T>({ q, children, loading, errorTitle }: { q: UseQueryResult<T>; children: (data: T) => ReactNode; loading?: ReactNode; errorTitle?: string }) {
  if (q.isPending) return <>{loading ?? <LoadingBlock />}</>;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} title={errorTitle} />;
  return <>{children(q.data)}</>;
}
