import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useNetwork } from '../App';
import { api, ApiError, money, num, ago } from '../api';
import type { ChargerSummary, SessionSummary, Kpis, Uptime } from '../types';
import { Card, PageHeader, Spinner, ErrorBox, Empty, StatCard, Table, StatusPill, KV } from '../components/ui';
import { Donut, STATUS_COLORS } from '../components/charts';

const ACTIVE = new Set(['active', 'charging', 'inprogress', 'in_progress']);

function bucket(status: string): 'available' | 'charging' | 'offline' | 'other' {
  const s = (status || '').toLowerCase();
  if (s.includes('available')) return 'available';
  if (s.includes('charging')) return 'charging';
  if (s.includes('offline') || s.includes('unavailable')) return 'offline';
  return 'other';
}

export function Dashboard() {
  const network = useNetwork();
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [uptime, setUptime] = useState<Uptime | null>(null);
  const [chargers, setChargers] = useState<ChargerSummary[]>([]);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<ApiError | null>(null);

  useEffect(() => {
    if (!network) return;
    let live = true;
    setLoading(true);
    setErr(null);
    (async () => {
      try {
        const [k, u, c, s] = await Promise.all([
          api.kpis(network),
          api.uptime(network),
          api.chargers(network),
          api.sessions(network, {}),
        ]);
        if (!live) return;
        setKpis(k);
        setUptime(u);
        setChargers(c.data);
        setSessions(s.data);
      } catch (e) {
        if (live && e instanceof ApiError) setErr(e);
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [network]);

  if (!network) return <Empty msg="Select a network to continue." />;
  if (loading) return <Spinner label="Loading network overview…" />;
  if (err) return <ErrorBox error={err} />;

  const counts = { available: 0, charging: 0, offline: 0, other: 0 };
  for (const c of chargers) counts[bucket(c.status)] += 1;

  const segments = [
    { label: 'Available', value: counts.available, color: STATUS_COLORS.available },
    { label: 'Charging', value: counts.charging, color: STATUS_COLORS.charging },
    { label: 'Offline', value: counts.offline, color: STATUS_COLORS.offline },
    { label: 'Other', value: counts.other, color: STATUS_COLORS.other },
  ];

  const online = (uptime?.available ?? 0) + (uptime?.charging ?? 0);
  const activeSessions = sessions.filter((s) => ACTIVE.has((s.status || '').toLowerCase())).length;
  const recent = [...sessions]
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
    .slice(0, 8);

  const rows: ReactNode[][] = recent.map((s) => [
    <Link key={s.id} to={'/sessions/' + s.id} className="mono">
      {s.id.slice(0, 8)}
    </Link>,
    <span className="mono">{s.chargerUid || s.chargerUuid || s.chargerId}</span>,
    num(s.energyKwh) + ' kWh',
    <StatusPill value={s.status} />,
    ago(s.startedAt),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Network overview"
        sub="GET /cpms/v1/analytics/kpis · /analytics/uptime · /chargers · /sessions · X-Network-Id"
      />

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard label="Total Chargers" value={num(uptime?.totalChargers, 0)} hint="fleet size" />
        <StatCard
          label="Online"
          value={num(online, 0)}
          hint={uptime ? num(uptime.uptimePercent, 1) + '% uptime' : undefined}
          accent
        />
        <StatCard label="Active Sessions" value={num(activeSessions, 0)} hint="charging now" />
        <StatCard label="Revenue" value={money(kpis?.totalRevenue)} hint="last 30 days" />
        <StatCard label="Energy" value={num(kpis?.totalEnergyKwh) + ' kWh'} hint="last 30 days" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card
          title="Fleet status"
          right={<span className="mono text-xs text-[color:var(--color-ink-soft)]">{chargers.length} chargers</span>}
        >
          {chargers.length ? <Donut segments={segments} /> : <Empty msg="No chargers in this network." />}
        </Card>

        <Card title="Recent sessions" right={<Link to="/sessions" className="text-xs">View all →</Link>}>
          {rows.length ? (
            <Table columns={['Session', 'Charger', 'Energy', 'Status', 'Started']} rows={rows} numeric={[2]} dense />
          ) : (
            <Empty msg="No sessions yet." />
          )}
        </Card>
      </div>

      <Card
        title="KPIs (last 30 days)"
        right={
          kpis ? (
            <span className="mono text-xs text-[color:var(--color-ink-soft)]">
              {kpis.from?.slice(0, 10)} → {kpis.to?.slice(0, 10)}
            </span>
          ) : undefined
        }
      >
        {kpis ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-1">
            <KV k="Total sessions" v={num(kpis.totalSessions, 0)} mono />
            <KV k="Total energy" v={num(kpis.totalEnergyKwh) + ' kWh'} mono />
            <KV k="Total revenue" v={money(kpis.totalRevenue)} mono />
            <KV k="Avg duration" v={num(kpis.avgDurationMinutes, 1) + ' min'} mono />
            <KV k="Active sessions" v={num(activeSessions, 0)} mono />
            <KV k="Networks" v={num(kpis.networkCount, 0)} mono />
          </div>
        ) : (
          <Empty msg="No KPI data available." />
        )}
      </Card>
    </div>
  );
}
