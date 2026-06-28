import { useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useApp, Logo } from '../App';
import { logout, accessTokenOf, decodeJwt } from '../auth';
import { networkUuid } from '../api';

export function Layout({ children }: { children: ReactNode }) {
  const { user, networks, selected, setSelected } = useApp();
  const [showToken, setShowToken] = useState(false);
  const token = accessTokenOf(user);
  const claims = token ? decodeJwt(token) : null;
  const email = (user?.profile?.email as string) ?? (user?.profile?.name as string) ?? 'operator';

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-black/5 bg-white/75 backdrop-blur">
        <div className="mx-auto max-w-6xl px-5 h-16 flex items-center gap-6">
          <Logo size={32} />
          <nav className="flex items-center gap-1 text-sm font-medium">
            {[
              ['/', 'Dashboard'],
              ['/chargers', 'Chargers'],
              ['/sessions', 'Sessions'],
            ].map(([to, label]) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  `px-3 py-1.5 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-[color:var(--color-brand-50)] text-[color:var(--color-brand-700)]'
                      : 'text-[color:var(--color-ink-soft)] hover:text-[color:var(--color-ink)]'
                  }`
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            {networks.length > 0 && (
              <select
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
                className="text-sm rounded-lg border border-black/10 bg-white px-3 py-1.5 max-w-[200px]"
                title="Active network (sent as X-Network-Id)"
              >
                {networks.map((n) => {
                  const id = networkUuid(n);
                  return (
                    <option key={id} value={id}>
                      {(n.name as string) ?? id}
                    </option>
                  );
                })}
              </select>
            )}
            <button
              onClick={() => setShowToken((s) => !s)}
              className="text-xs font-semibold text-[color:var(--color-brand-600)] hover:underline"
            >
              {showToken ? 'Hide token' : 'Token'}
            </button>
            <span className="text-sm text-[color:var(--color-ink-soft)] hidden sm:inline">{email}</span>
            <button
              onClick={() => logout()}
              className="text-sm rounded-lg border border-black/10 px-3 py-1.5 hover:bg-black/[0.03]"
            >
              Sign out
            </button>
          </div>
        </div>
        {showToken && claims && (
          <div className="border-t border-black/5 bg-[color:var(--color-brand-50)]/60">
            <div className="mx-auto max-w-6xl px-5 py-3 text-xs grid gap-1 scroll-thin overflow-auto">
              <TokenRow k="aud (resource)" v={String(claims.aud ?? '—')} />
              <TokenRow k="iss" v={String(claims.iss ?? '—')} />
              <TokenRow k="sub" v={String(claims.sub ?? '—')} />
              <TokenRow k="scope" v={String((claims.scope as string) ?? (claims.scp as string) ?? '—')} />
              <TokenRow k="cnf (DPoP)" v={claims.cnf ? 'present' : 'none (plain bearer)'} />
            </div>
          </div>
        )}
      </header>
      <main className="mx-auto max-w-6xl px-5 py-8">{children}</main>
    </div>
  );
}

function TokenRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-3">
      <span className="w-32 shrink-0 font-semibold text-[color:var(--color-ink-soft)]">{k}</span>
      <span className="mono break-all">{v}</span>
    </div>
  );
}
