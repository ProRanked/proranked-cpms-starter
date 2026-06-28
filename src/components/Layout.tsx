import { useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useApp, Logo } from '../App';
import { logout, accessTokenOf, decodeJwt } from '../auth';

const NAV: { section: string; items: [string, string, string][] }[] = [
  { section: 'Overview', items: [['/', 'Dashboard', '▤'], ['/analytics', 'Analytics', '📈']] },
  { section: 'Charge points', items: [
    ['/locations', 'Locations', '📍'], ['/chargers', 'Chargers', '🔌'],
    ['/sessions', 'Sessions', '⚡'], ['/tariffs', 'Tariffs', '＄'], ['/transactions', 'Transactions', '🧾'],
  ] },
  { section: 'Drivers & billing', items: [['/wallet', 'Wallets', '👛'], ['/holds', 'Fraud holds', '🚫']] },
  { section: 'Platform', items: [
    ['/webhooks', 'Webhooks', '🪝'], ['/events', 'Live events', '📡'], ['/audit', 'Audit log', '🔎'], ['/limits', 'Limits', '🛡'],
  ] },
  { section: 'Organization', items: [
    ['/settings', 'Settings', '⚙'], ['/team', 'Team', '👥'], ['/api-keys', 'API keys', '🔑'], ['/catalog', 'Catalog', '📦'],
  ] },
];

export function Layout({ children }: { children: ReactNode }) {
  const { user, networks, selected, setSelected } = useApp();
  const [showToken, setShowToken] = useState(false);
  const token = accessTokenOf(user);
  const claims = token ? decodeJwt(token) : null;
  const email = (user?.profile?.email as string) ?? (user?.profile?.name as string) ?? 'operator';

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-[248px] shrink-0 border-r border-black/5 bg-white/70 backdrop-blur sticky top-0 h-screen flex flex-col">
        <div className="h-16 flex items-center px-5 border-b border-black/5"><Logo size={30} /></div>
        <nav className="flex-1 overflow-y-auto scroll-thin py-4 px-3 space-y-5">
          {NAV.map((g) => (
            <div key={g.section}>
              <p className="px-2 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[color:var(--color-ink-soft)]">{g.section}</p>
              <div className="space-y-0.5">
                {g.items.map(([to, label, icon]) => (
                  <NavLink key={to} to={to} end={to === '/'}
                    className={({ isActive }) => `flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                      isActive ? 'bg-[color:var(--color-brand-50)] text-[color:var(--color-brand-700)]' : 'text-[color:var(--color-ink-soft)] hover:text-[color:var(--color-ink)] hover:bg-black/[0.03]'}`}>
                    <span className="w-4 text-center text-[13px] opacity-80">{icon}</span>{label}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="p-3 border-t border-black/5 text-[11px] text-[color:var(--color-ink-soft)]">
          <p className="mono truncate" title={email}>{email}</p>
          <button onClick={() => logout()} className="mt-1 hover:text-[color:var(--color-ink)] underline">Sign out</button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 min-w-0">
        <header className="sticky top-0 z-10 h-16 flex items-center gap-3 px-6 border-b border-black/5 bg-white/70 backdrop-blur">
          {networks.length > 0 && (
            <label className="flex items-center gap-2 text-sm">
              <span className="text-[color:var(--color-ink-soft)]">Network</span>
              <select value={selected} onChange={(e) => setSelected(e.target.value)}
                className="rounded-lg border border-black/10 bg-white px-3 py-1.5 max-w-[240px]" title="Active network (X-Network-Id)">
                {networks.map((n) => <option key={n.id} value={n.id}>{n.name || n.id}</option>)}
              </select>
            </label>
          )}
          <div className="ml-auto flex items-center gap-3">
            <button onClick={() => setShowToken((s) => !s)} className="text-xs font-semibold text-[color:var(--color-brand-600)] hover:underline">{showToken ? 'Hide token' : 'Token'}</button>
          </div>
        </header>
        {showToken && claims && (
          <div className="border-b border-black/5 bg-[color:var(--color-brand-50)]/50 px-6 py-3 text-xs grid gap-1 scroll-thin overflow-auto">
            <TokenRow k="aud" v={String(claims.aud ?? '—')} />
            <TokenRow k="iss" v={String(claims.iss ?? '—')} />
            <TokenRow k="sub" v={String(claims.sub ?? '—')} />
            <TokenRow k="scope" v={String((claims.scope as string) ?? (claims.scp as string) ?? '—')} />
            <TokenRow k="cnf (DPoP)" v={claims.cnf ? 'present' : 'none (plain bearer)'} />
          </div>
        )}
        <main className="px-6 py-7 max-w-[1400px]">{children}</main>
      </div>
    </div>
  );
}

function TokenRow({ k, v }: { k: string; v: string }) {
  return <div className="flex gap-3"><span className="w-28 shrink-0 font-semibold text-[color:var(--color-ink-soft)]">{k}</span><span className="mono break-all">{v}</span></div>;
}
