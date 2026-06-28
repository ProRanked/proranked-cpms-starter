import { useEffect, useMemo, useState } from 'react';
import { useNetwork } from '../App';
import { api, ApiError, money, num } from '../api';
import type { Kpis, AnalyticsRollup } from '../types';
import { useResource } from '../hooks';
import { Card, PageHeader, Spinner, ErrorBox, Empty, StatCard, Table, Tabs, Btn, Notice } from '../components/ui';
import { AreaChart, BarChart } from '../components/charts';

const RANGES = [7, 30, 90];
const TABS = ['Revenue', 'Energy', 'Sessions', 'Utilization'];

// The analytics rollup is server-side opaque (networks[0].rollup is a loose bag). Defensively dig out the
// first array-of-objects and map each row to {x,y} by probing well-known date/value field names.
const X_KEYS = ['date', 'day', 'period', 'label', 'timestamp', 'bucket', 'x', 'name'];
const Y_KEYS = ['value', 'total', 'totalRevenue', 'totalEnergyKwh', 'totalSessions', 'revenue', 'energyKwh', 'sessions', 'count', 'amount', 'y'];
const UTIL_KEYS = ['averageUtilization', 'utilization', 'utilizationPercent', 'utilizationPct', 'avgUtilization', 'value', 'percent'];

function fmtX(x: string): string {
  const d = new Date(x);
  return Number.isNaN(d.getTime()) ? x : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function extractSeries(rollup: AnalyticsRollup | null): { x: string; y: number }[] {
  const bag = rollup?.networks?.[0]?.rollup;
  if (!bag || typeof bag !== 'object') return [];
  let arr: unknown[] | null = null;
  for (const v of Object.values(bag)) {
    if (Array.isArray(v) && v.length > 0 && typeof v[0] === 'object' && v[0] !== null) { arr = v; break; }
  }
  if (!arr) return [];
  const out: { x: string; y: number }[] = [];
  for (const item of arr) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    let x = '';
    for (const k of X_KEYS) { const v = row[k]; if (v !== undefined && v !== null && v !== '') { x = String(v); break; } }
    let y: number | null = null;
    for (const k of Y_KEYS) { const v = row[k]; if (typeof v === 'number') { y = v; break; } }
    if (y === null) continue;
    out.push({ x: fmtX(x) || String(out.length + 1), y });
  }
  return out;
}

// Pull a utilization-ish number out of a loose per-network rollup bag.
function pickUtil(bag: Record<string, unknown> | null | undefined): number | null {
  if (!bag || typeof bag !== 'object') return null;
  for (const k of UTIL_KEYS) { const v = bag[k]; if (typeof v === 'number') return v; }
  return null;
}

// averageUtilization may arrive as a fraction (0–1) or a percentage (0–100). Show as %.
function fmtPct(v?: number | null): string {
  if (v === null || v === undefined) return '—';
  const pct = v <= 1 ? v * 100 : v;
  return `${num(pct, 1)}%`;
}

export function Analytics() {
  const network = useNetwork();
  const [range, setRange] = useState(30);
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [revenue, setRevenue] = useState<AnalyticsRollup | null>(null);
  const [energy, setEnergy] = useState<AnalyticsRollup | null>(null);
  const [sessions, setSessions] = useState<AnalyticsRollup | null>(null);
  const [tab, setTab] = useState('Revenue');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<ApiError | null>(null);

  // Export + utilization
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);

  const { from, to } = useMemo(() => {
    const toD = new Date();
    const fromD = new Date(toD.getTime() - range * 86400000);
    return { from: fromD.toISOString(), to: toD.toISOString() };
  }, [range]);

  // Utilization is its own endpoint with no date range — fetch lazily when the tab is opened.
  const util = useResource(() => api.utilization(network), [network], !!network && tab === 'Utilization');

  useEffect(() => {
    if (!network) return;
    let live = true;
    setLoading(true);
    setErr(null);
    (async () => {
      try {
        const kp = await api.kpis(network, { from, to });
        // rollups fail soft — a missing/empty endpoint must not kill the KPI cards
        const [rev, en, ses] = await Promise.all([
          api.revenue(network, { from, to, period: 'day' }).catch(() => null),
          api.energy(network, { from, to, period: 'day' }).catch(() => null),
          api.sessionsRollup(network, { from, to, period: 'day' }).catch(() => null),
        ]);
        if (!live) return;
        setKpis(kp);
        setRevenue(rev);
        setEnergy(en);
        setSessions(ses);
      } catch (e) {
        if (e instanceof ApiError && live) setErr(e);
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => { live = false; };
  }, [network, from, to]);

  async function exportCsv() {
    if (!network) return;
    setExporting(true);
    setExportMsg(null);
    try {
      await api.exportReport(network, 'sessions', { from, to });
      setExportMsg({ tone: 'ok', text: 'Sessions report downloaded.' });
    } catch (e) {
      const msg = e instanceof ApiError
        ? (e.status === 403 ? `${e.message} — needs cpms:read:* / report export may be off by default` : e.message)
        : String(e);
      setExportMsg({ tone: 'bad', text: msg });
    } finally {
      setExporting(false);
    }
  }

  const rangeButtons = (
    <div className="flex items-center gap-1">
      {RANGES.map((d) => (
        <Btn key={d} variant={range === d ? 'primary' : 'ghost'} onClick={() => setRange(d)}>{d}d</Btn>
      ))}
    </div>
  );
  const headerRight = (
    <>
      {rangeButtons}
      <Btn variant="ghost" loading={exporting} onClick={exportCsv} disabled={!network}>Export CSV</Btn>
    </>
  );

  if (!network) return <Empty msg="Select a network to continue." />;

  const header = <PageHeader title="Analytics" sub="GET /cpms/v1/analytics/{kpis,revenue,energy,sessions,utilization} · GET /cpms/v1/reports/export" right={headerRight} />;
  const exportNotice = exportMsg && <div className="mb-4"><Notice tone={exportMsg.tone}>{exportMsg.text}</Notice></div>;

  if (loading) return <div>{header}{exportNotice}<Spinner label="Loading analytics…" /></div>;
  if (err) return <div>{header}{exportNotice}<ErrorBox error={err} /></div>;
  if (!kpis) return <div>{header}{exportNotice}<Empty msg="No analytics for this network yet." /></div>;

  const revSeries = extractSeries(revenue);
  const enSeries = extractSeries(energy);
  const sesSeries = extractSeries(sessions);

  const utilTab = (() => {
    if (util.loading) return <Spinner label="Loading utilization…" />;
    if (util.error) return <ErrorBox error={util.error} />;
    const u = util.data;
    if (!u) return <Empty msg="No utilization data for this network." />;
    const rows = (u.networks ?? []).map((nw) => {
      const v = pickUtil(nw.rollup);
      return [<span className="mono">{nw.networkId}</span>, fmtPct(v)];
    });
    return (
      <div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-5">
          <StatCard label="Average utilization" value={fmtPct(u.averageUtilization)} hint={u.period || 'all chargers'} accent />
          <StatCard label="Networks" value={num(u.networkCount, 0)} hint="in rollup" />
          <StatCard label="Window" value={u.from || u.to ? `${fmtX(u.from)} → ${fmtX(u.to)}` : '—'} hint={u.metric || 'utilization'} />
        </div>
        {rows.length
          ? <Table columns={['Network', 'Utilization']} rows={rows} numeric={[1]} dense />
          : <Empty msg="No per-network utilization rows in this rollup." />}
      </div>
    );
  })();

  const chart = (() => {
    if (tab === 'Utilization') return utilTab;
    if (tab === 'Revenue') {
      return revSeries.length
        ? <AreaChart data={revSeries} fmt={(n) => money(n)} />
        : <Empty msg="No time-series in this rollup" />;
    }
    if (tab === 'Energy') {
      return enSeries.length
        ? <AreaChart data={enSeries} color="#10b981" fmt={(n) => `${num(n, 1)} kWh`} />
        : <Empty msg="No time-series in this rollup" />;
    }
    return sesSeries.length
      ? <BarChart data={sesSeries} fmt={(n) => num(n, 0)} />
      : <Empty msg="No time-series in this rollup" />;
  })();

  return (
    <div>
      {header}
      {exportNotice}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Revenue" value={money(kpis.totalRevenue)} hint={`last ${range}d`} accent />
        <StatCard label="Sessions" value={num(kpis.totalSessions, 0)} hint={`last ${range}d`} />
        <StatCard label="Energy" value={`${num(kpis.totalEnergyKwh, 1)} kWh`} hint={`last ${range}d`} />
        <StatCard label="Avg duration" value={`${num(kpis.avgDurationMinutes, 0)} min`} hint="per session" />
      </div>

      <Card title={tab === 'Utilization' ? 'Utilization' : `${tab} · ${range}d`} className="p-5">
        <Tabs tabs={TABS} active={tab} onChange={setTab} />
        {chart}
      </Card>
    </div>
  );
}
