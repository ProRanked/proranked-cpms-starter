import { createContext, useContext, useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import type { User } from 'oidc-client-ts';
import { getUser, login } from './auth';
import { api } from './api';
import type { NetworkSummary } from './types';
import { config } from './config';
import { Layout } from './components/Layout';
import { Callback } from './pages/Callback';
import { Dashboard } from './pages/Dashboard';
import { Locations } from './pages/Locations';
import { Chargers } from './pages/Chargers';
import { ChargerDetail } from './pages/ChargerDetail';
import { Sessions } from './pages/Sessions';
import { SessionDetail } from './pages/SessionDetail';
import { Tariffs } from './pages/Tariffs';
import { Transactions } from './pages/Transactions';
import { Analytics } from './pages/Analytics';
import { Webhooks } from './pages/Webhooks';
import { AuditLog } from './pages/AuditLog';
import { Limits } from './pages/Limits';

interface AppState {
  user: User | null;
  networks: NetworkSummary[];
  selected: string;
  setSelected: (uuid: string) => void;
}
const Ctx = createContext<AppState>(null!);
export const useApp = () => useContext(Ctx);
/** The active network UUID — pages call this for X-Network-Id. */
export const useNetwork = () => useApp().selected;

function AuthedShell() {
  const [user, setUser] = useState<User | null>(null);
  const [networks, setNetworks] = useState<NetworkSummary[]>([]);
  const [selected, setSelected] = useState<string>(() => sessionStorage.getItem('pr_net') ?? '');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const u = await getUser();
      setUser(u);
      if (u && !u.expired) {
        try {
          const nets = (await api.networks()).data;
          setNetworks(nets);
          setSelected((cur) => (cur && nets.some((n) => n.id === cur) ? cur : nets[0]?.id ?? ''));
        } catch { /* until enabled / has a network */ }
      }
      setLoading(false);
    })();
  }, []);

  const choose = (id: string) => { setSelected(id); sessionStorage.setItem('pr_net', id); };

  if (loading) return <Splash sub="Loading session…" />;
  if (!user || user.expired) return <SignIn />;

  return (
    <Ctx.Provider value={{ user, networks, selected, setSelected: choose }}>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/locations" element={<Locations />} />
          <Route path="/chargers" element={<Chargers />} />
          <Route path="/chargers/:id" element={<ChargerDetail />} />
          <Route path="/sessions" element={<Sessions />} />
          <Route path="/sessions/:id" element={<SessionDetail />} />
          <Route path="/tariffs" element={<Tariffs />} />
          <Route path="/transactions" element={<Transactions />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/webhooks" element={<Webhooks />} />
          <Route path="/audit" element={<AuditLog />} />
          <Route path="/limits" element={<Limits />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </Ctx.Provider>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/auth/callback" element={<Callback />} />
      <Route path="/*" element={<AuthedShell />} />
    </Routes>
  );
}

function Splash({ sub }: { sub: string }) {
  return <div className="min-h-screen grid place-items-center"><div className="text-center"><Logo /><p className="mt-4 text-sm text-[color:var(--color-ink-soft)]">{sub}</p></div></div>;
}

function SignIn() {
  return (
    <div className="min-h-screen grid place-items-center px-6">
      <div className="w-full max-w-md">
        <div className="rounded-3xl border border-black/5 bg-white/80 backdrop-blur shadow-[0_20px_60px_-20px_rgba(10,132,255,0.35)] p-9">
          <Logo />
          <h1 className="mt-6 text-2xl font-extrabold tracking-tight">CPMS Console</h1>
          <p className="mt-2 text-[15px] leading-relaxed text-[color:var(--color-ink-soft)]">
            A backend-less operator console built directly on the{' '}
            <span className="font-semibold text-[color:var(--color-brand-600)]">ProRanked CPMS API</span>. PKCE login,
            a role-scoped operator token, calls straight to <span className="mono text-[13px]">/cpms/v1</span> — no server, no secret.
          </p>
          <button onClick={() => login()} className="mt-7 w-full rounded-xl bg-[color:var(--color-brand-500)] hover:bg-[color:var(--color-brand-600)] text-white font-semibold py-3 transition-colors">Sign in with ProRanked</button>
          <p className="mt-4 text-xs text-[color:var(--color-ink-soft)] mono break-all">{config.oidcAuthority}</p>
        </div>
        <p className="mt-5 text-center text-xs text-[color:var(--color-ink-soft)]">Fork this starter · powered by ProRanked</p>
      </div>
    </div>
  );
}

export function Logo({ size = 36 }: { size?: number }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid place-items-center rounded-[9px] bg-[color:var(--color-brand-500)] text-white font-extrabold" style={{ width: size, height: size, fontSize: size * 0.5 }}>P</span>
      <span className="text-lg font-extrabold tracking-tight">ProRanked <span className="font-medium text-[color:var(--color-ink-soft)]">CPMS</span></span>
    </div>
  );
}
