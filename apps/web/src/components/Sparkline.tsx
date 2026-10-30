type Pt = { t: string; v: number };

// Minimal sparkline: one series, area + line + end dot, coloured by the agent that watches the metric.
export function Sparkline({ points, color, label }: { points: Pt[]; color: string; label: string }) {
  if (points.length < 2) return <div className="spark muted tiny" aria-label={`${label}: not enough data yet`}>Not enough data yet</div>;
  const W = 240, H = 44, pad = 3;
  const vs = points.map((p) => p.v);
  const min = Math.min(...vs), max = Math.max(...vs);
  const span = max - min || 1;
  const x = (i: number) => (i / (points.length - 1)) * W;
  const y = (v: number) => H - pad - ((v - min) / span) * (H - pad * 2);
  const d = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join("");
  const last = points[points.length - 1];
  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`${label}: ${points.length} days, from ${vs[0]} to ${last.v}, low ${min}, high ${max}`}>
      <path className="area" d={`${d}L${W},${H}L0,${H}Z`} fill={color} />
      <path className="line" d={d} stroke={color} vectorEffect="non-scaling-stroke" />
      <circle className="last" cx={x(points.length - 1)} cy={y(last.v)} r={3.2} fill={color} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
