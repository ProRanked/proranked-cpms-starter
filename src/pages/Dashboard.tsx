import { useEffect, useState } from 'react';
import { useApp } from '../App';
import { api, ApiError, field } from '../api';
import { Card, PageHeader, Spinner, ErrorBox, Empty } from '../components/ui';

export function Dashboard() {
  const { selected, networks } = useApp();
  const [me, setMe] = useState<Record<string, unknown> | null>(null);
  const [stats, setStats] = useState<{ chargers: number; sessions: number } | null>(null);
  const [err, setErr] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setErr(null);
    (async () => {
      try {
        const meRes = await api.me().catch(() => null);
        if (live) setMe(meRes);
        if (selected) {
          const [chargers, sessions] = await Promise.all([
            api.chargers(selected).catch(() => []),
            api.sessions(selected).catch(() => []),
          ]);
          if (live) setStats({ chargers: chargers.length, sessions: sessions.length });
        }
      } catch (e) {
        if (live && e instanceof ApiError) setErr(e);
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [selected]);

  return (
    <>
      <PageHeader
        title="Dashboard"
        sub="Live data, fetched in-browser from /cpms/v1 with your operator token — no backend in between."
      />
      {loading ? (
        <Spinner />
      ) : err ? (
        <ErrorBox error={err} />
      ) : (
        <div className="grid gap-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <Stat label="Networks" value={networks.length} hint="you can act on" />
            <Stat label="Chargers" value={stats?.chargers ?? '—'} hint="in the active network" />
            <Stat label="Sessions" value={stats?.sessions ?? '—'} hint="recent" />
          </div>
          <Card className="p-6">
            <h2 className="text-sm font-semibold text-[color:var(--color-ink-soft)]">Operator (GET /cpms/v1/me)</h2>
            {me ? (
              <div className="mt-3 grid sm:grid-cols-2 gap-2 text-sm">
                <KV k="Email" v={field(me, 'email')} />
                <KV k="Name" v={field(me, 'name', 'displayName')} />
                <KV k="User" v={field(me, 'userUuid', 'id', 'sub')} />
                <KV k="Networks" v={String(networks.length)} />
              </div>
            ) : (
              <Empty msg="No /me payload (endpoint may differ or be disabled). The token still authorizes the calls above." />
            )}
          </Card>
        </div>
      )}
    </>
  );
}

function Stat({ label, value, hint }: { label: string; value: number | string; hint: string }) {
  return (
    <Card className="p-6">
      <p className="text-sm font-semibold text-[color:var(--color-ink-soft)]">{label}</p>
      <p className="mt-2 text-4xl font-extrabold tracking-tight">{value}</p>
      <p className="mt-1 text-xs text-[color:var(--color-ink-soft)]">{hint}</p>
    </Card>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <span className="text-[color:var(--color-ink-soft)]">{k}: </span>
      <span className="mono">{v}</span>
    </div>
  );
}
