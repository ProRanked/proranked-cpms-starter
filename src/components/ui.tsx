import type { ReactNode } from 'react';

export function Card({ children, className = '', title, right }: { children: ReactNode; className?: string; title?: ReactNode; right?: ReactNode }) {
  return (
    <div className={`rounded-2xl border border-black/5 bg-white/80 backdrop-blur shadow-sm ${className}`}>
      {title && (
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-black/5">
          <h3 className="text-sm font-semibold text-[color:var(--color-ink)]">{title}</h3>
          {right}
        </div>
      )}
      {children}
    </div>
  );
}

export function PageHeader({ title, sub, right }: { title: string; sub?: string; right?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
        {sub && <p className="mt-1 text-[13px] text-[color:var(--color-ink-soft)] mono">{sub}</p>}
      </div>
      {right && <div className="flex items-center gap-2">{right}</div>}
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
      <p className="text-sm font-semibold text-red-700">{error.code ?? 'error'} {error.status ? `(${error.status})` : ''}</p>
      <p className="mt-1 text-sm text-red-700/90">{error.message}</p>
    </Card>
  );
}

export function Empty({ msg }: { msg: string }) {
  return <Card className="p-10 text-center text-sm text-[color:var(--color-ink-soft)]">{msg}</Card>;
}

export function StatCard({ label, value, hint, accent }: { label: string; value: ReactNode; hint?: string; accent?: boolean }) {
  return (
    <Card className="p-5">
      <p className="text-[13px] font-semibold text-[color:var(--color-ink-soft)]">{label}</p>
      <p className={`mt-1.5 text-3xl font-extrabold tracking-tight ${accent ? 'text-[color:var(--color-brand-600)]' : ''}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-[color:var(--color-ink-soft)]">{hint}</p>}
    </Card>
  );
}

export function Table({ columns, rows, dense, numeric }: { columns: string[]; rows: ReactNode[][]; dense?: boolean; numeric?: number[] }) {
  const pad = dense ? 'px-3 py-2' : 'px-4 py-3';
  const isNum = (j: number) => numeric?.includes(j);
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto scroll-thin">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[color:var(--color-ink-soft)] border-b border-black/5 bg-white/60">
              {columns.map((c, j) => (
                <th key={c} className={`font-semibold ${pad} whitespace-nowrap ${isNum(j) ? 'text-right' : ''}`}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-black/[0.04] last:border-0 hover:bg-[color:var(--color-brand-50)]/40">
                {r.map((cell, j) => (
                  <td key={j} className={`${pad} whitespace-nowrap ${isNum(j) ? 'text-right mono tabular-nums' : ''}`}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

const TONES: Record<string, string> = {
  ok: 'bg-emerald-50 text-emerald-700',
  warn: 'bg-amber-50 text-amber-700',
  bad: 'bg-red-50 text-red-700',
  info: 'bg-[color:var(--color-brand-50)] text-[color:var(--color-brand-700)]',
  mute: 'bg-slate-100 text-slate-600',
};
export function toneFor(value: string): keyof typeof TONES {
  const v = (value || '').toLowerCase();
  if (/(avail|online|active|charging|accepted|completed|approved|paid|succeeded|operative)/.test(v)) return 'ok';
  if (/(prepar|finishing|suspend|pending|reserved|booting|in[_ ]?progress)/.test(v)) return 'warn';
  if (/(fault|error|offline|unavail|rejected|failed|denied|revoked|expired|disputed|inoperative|timeout)/.test(v)) return 'bad';
  if (v === 'unknown' || v === '' || v === '—') return 'mute';
  return 'info';
}
export function StatusPill({ value, tone }: { value: string; tone?: keyof typeof TONES }) {
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONES[tone ?? toneFor(value)]}`}>{value || '—'}</span>;
}

export function Tabs({ tabs, active, onChange }: { tabs: string[]; active: string; onChange: (t: string) => void }) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto scroll-thin border-b border-black/5 mb-5">
      {tabs.map((t) => (
        <button
          key={t}
          onClick={() => onChange(t)}
          className={`px-3.5 py-2 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
            active === t
              ? 'border-[color:var(--color-brand-500)] text-[color:var(--color-brand-700)]'
              : 'border-transparent text-[color:var(--color-ink-soft)] hover:text-[color:var(--color-ink)]'
          }`}
        >{t}</button>
      ))}
    </div>
  );
}

export function KV({ k, v, mono }: { k: string; v: ReactNode; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 border-b border-black/[0.04] last:border-0">
      <span className="text-[color:var(--color-ink-soft)] text-sm">{k}</span>
      <span className={`text-sm text-right ${mono ? 'mono' : ''}`}>{v}</span>
    </div>
  );
}

export function Btn({ children, onClick, variant = 'ghost', disabled, type }: { children: ReactNode; onClick?: () => void; variant?: 'primary' | 'ghost' | 'danger'; disabled?: boolean; type?: 'button' | 'submit' }) {
  const styles = {
    primary: 'bg-[color:var(--color-brand-500)] hover:bg-[color:var(--color-brand-600)] text-white',
    ghost: 'border border-black/10 hover:bg-black/[0.03] text-[color:var(--color-ink)]',
    danger: 'border border-red-200 text-red-700 hover:bg-red-50',
  }[variant];
  return (
    <button type={type ?? 'button'} onClick={onClick} disabled={disabled}
      className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors disabled:opacity-50 ${styles}`}>{children}</button>
  );
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl border border-black/5 bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-black/5">
          <h3 className="font-bold">{title}</h3>
          <button onClick={onClose} className="text-[color:var(--color-ink-soft)] hover:text-[color:var(--color-ink)]">✕</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`w-full rounded-lg border border-black/10 px-3 py-2 text-sm ${props.className ?? ''}`} />;
}
