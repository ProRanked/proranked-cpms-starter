// Dependency-free inline-SVG charts — keeps the starter zero-dep + fork-friendly.
const BRAND = '#0a84ff';

export function AreaChart({ data, height = 160, color = BRAND, fmt }: { data: { x: string; y: number }[]; height?: number; color?: string; fmt?: (n: number) => string }) {
  if (!data.length) return <Placeholder height={height} />;
  const w = 600, h = height, pad = 8;
  const max = Math.max(...data.map((d) => d.y), 1);
  const step = data.length > 1 ? (w - pad * 2) / (data.length - 1) : 0;
  const pts = data.map((d, i) => [pad + i * step, h - pad - (d.y / max) * (h - pad * 2)] as const);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const area = `${line} L${pts[pts.length - 1][0].toFixed(1)},${h - pad} L${pts[0][0].toFixed(1)},${h - pad} Z`;
  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height }} preserveAspectRatio="none">
        <defs><linearGradient id="ag" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.22" /><stop offset="100%" stopColor={color} stopOpacity="0" /></linearGradient></defs>
        <path d={area} fill="url(#ag)" />
        <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      <div className="flex justify-between text-[11px] text-[color:var(--color-ink-soft)] mt-1">
        <span>{data[0]?.x}</span>
        <span className="mono">max {fmt ? fmt(max) : max.toFixed(0)}</span>
        <span>{data[data.length - 1]?.x}</span>
      </div>
    </div>
  );
}

export function BarChart({ data, height = 160, color = BRAND, fmt }: { data: { x: string; y: number }[]; height?: number; color?: string; fmt?: (n: number) => string }) {
  if (!data.length) return <Placeholder height={height} />;
  const max = Math.max(...data.map((d) => d.y), 1);
  return (
    <div className="w-full">
      <div className="flex items-end gap-1" style={{ height }}>
        {data.map((d, i) => (
          <div key={i} className="flex-1 flex flex-col justify-end items-center group" title={`${d.x}: ${fmt ? fmt(d.y) : d.y}`}>
            <div className="w-full rounded-t" style={{ height: `${(d.y / max) * 100}%`, background: color, opacity: 0.85, minHeight: d.y > 0 ? 2 : 0 }} />
          </div>
        ))}
      </div>
      <div className="flex justify-between text-[11px] text-[color:var(--color-ink-soft)] mt-1">
        <span>{data[0]?.x}</span><span className="mono">max {fmt ? fmt(max) : max.toFixed(0)}</span><span>{data[data.length - 1]?.x}</span>
      </div>
    </div>
  );
}

export function Donut({ segments, size = 160 }: { segments: { label: string; value: number; color: string }[]; size?: number }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const r = size / 2 - 12, cx = size / 2, cy = size / 2, C = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="flex items-center gap-5">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#eef1f5" strokeWidth="14" />
        {segments.map((s, i) => {
          const len = (s.value / total) * C;
          const el = <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={s.color} strokeWidth="14"
            strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-offset} transform={`rotate(-90 ${cx} ${cy})`} strokeLinecap="butt" />;
          offset += len;
          return el;
        })}
        <text x={cx} y={cy - 2} textAnchor="middle" className="mono" fontSize="22" fontWeight="800" fill="#0b1220">{total}</text>
        <text x={cx} y={cy + 16} textAnchor="middle" fontSize="10" fill="#5b6b7e">total</text>
      </svg>
      <div className="space-y-1.5">
        {segments.map((s, i) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
            <span className="text-[color:var(--color-ink-soft)]">{s.label}</span>
            <span className="mono ml-auto font-semibold">{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Multi-series line for a session power/energy curve.
export function LineCurve({ series, height = 220, fmt }: { series: { name: string; color: string; points: { x: number; y: number }[] }[]; height?: number; fmt?: (n: number) => string }) {
  const all = series.flatMap((s) => s.points);
  if (!all.length) return <Placeholder height={height} />;
  const w = 700, h = height, pad = 10;
  const xs = all.map((p) => p.x), ys = all.map((p) => p.y);
  const xmin = Math.min(...xs), xmax = Math.max(...xs), ymax = Math.max(...ys, 1);
  const sx = (x: number) => pad + ((x - xmin) / (xmax - xmin || 1)) * (w - pad * 2);
  const sy = (y: number) => h - pad - (y / ymax) * (h - pad * 2);
  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height }} preserveAspectRatio="none">
        {[0.25, 0.5, 0.75].map((g) => <line key={g} x1={pad} x2={w - pad} y1={h - pad - g * (h - pad * 2)} y2={h - pad - g * (h - pad * 2)} stroke="#000" strokeOpacity="0.05" />)}
        {series.map((s) => (
          <path key={s.name} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round"
            d={s.points.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ')} />
        ))}
      </svg>
      <div className="flex gap-4 text-[11px] text-[color:var(--color-ink-soft)] mt-1">
        {series.map((s) => <span key={s.name} className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: s.color }} />{s.name}</span>)}
        <span className="mono ml-auto">peak {fmt ? fmt(ymax) : ymax.toFixed(1)}</span>
      </div>
    </div>
  );
}

function Placeholder({ height }: { height: number }) {
  return <div className="grid place-items-center text-xs text-[color:var(--color-ink-soft)]" style={{ height }}>No data</div>;
}

export const STATUS_COLORS: Record<string, string> = {
  available: '#10b981', charging: '#0a84ff', offline: '#ef4444', faulted: '#ef4444', preparing: '#f59e0b', other: '#94a3b8',
};
