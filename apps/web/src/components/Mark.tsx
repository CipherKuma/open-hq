import { agentName, agentShort } from "../lib/agents";

type Size = "xs" | "sm" | "md" | "lg";
export function Mark({ id, size = "md", status }: { id: string; size?: Size; status?: "idle" | "working" | "waiting" }) {
  return (
    <span className={`mark ${id} ${size === "md" ? "" : size}`} title={agentName(id)} aria-label={agentName(id)} role="img">
      {agentShort(id)}
      {status && status !== "idle" ? <span className={`sdot s-${status}`} aria-hidden="true" /> : null}
    </span>
  );
}

export function Marks({ ids, size = "sm" }: { ids: string[]; size?: Size }) {
  return (
    <span className="marks" aria-label={ids.map(agentName).join(", ")}>
      {ids.map((id) => <Mark key={id} id={id} size={size} />)}
    </span>
  );
}
