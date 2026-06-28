import type { ReactNode } from 'react';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-black/5 bg-white/80 backdrop-blur shadow-sm ${className}`}>{children}</div>
  );
}

export function PageHeader({ title, sub, right }: { title: string; sub?: string; right?: ReactNode }) {
  return (
    <div className="flex items-end justify-between mb-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
        {sub && <p className="mt-1 text-sm text-[color:var(--color-ink-soft)]">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 text-sm text-[color:var(--color-ink-soft)] py-10">
      <span className="h-4 w-4 rounded-full border-2 border-[color:var(--color-brand-500)] border-t-transparent animate-spin" />
      {label ?? 'Loading…'}
    </div>
  );
}

export function ErrorBox({ error }: { error: { status?: number; code?: string; message: string } }) {
  return (
    <Card className="p-5 border-red-200 bg-red-50/70">
      <p className="text-sm font-semibold text-red-700">
        {error.code ?? 'error'} {error.status ? `(${error.status})` : ''}
      </p>
      <p className="mt-1 text-sm text-red-700/90">{error.message}</p>
    </Card>
  );
}

export function Empty({ msg }: { msg: string }) {
  return (
    <Card className="p-10 text-center text-sm text-[color:var(--color-ink-soft)]">{msg}</Card>
  );
}

export function Table({ columns, rows }: { columns: string[]; rows: ReactNode[][] }) {
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto scroll-thin">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[color:var(--color-ink-soft)] border-b border-black/5">
              {columns.map((c) => (
                <th key={c} className="font-semibold px-4 py-3 whitespace-nowrap">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-black/[0.04] last:border-0 hover:bg-[color:var(--color-brand-50)]/40">
                {r.map((cell, j) => (
                  <td key={j} className="px-4 py-3 whitespace-nowrap">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export function StatusPill({ value }: { value: string }) {
  const v = value.toLowerCase();
  const tone =
    v.includes('avail') || v.includes('online') || v.includes('active') || v.includes('charg')
      ? 'bg-emerald-50 text-emerald-700'
      : v.includes('fault') || v.includes('error') || v.includes('offline') || v.includes('unavail')
        ? 'bg-red-50 text-red-700'
        : 'bg-slate-100 text-slate-600';
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${tone}`}>{value}</span>;
}
