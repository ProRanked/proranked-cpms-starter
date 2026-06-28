import { useEffect, useState } from 'react';
import { useNetwork } from '../App';
import { api, ApiError, num } from '../api';
import type { Limits as LimitsT, LimitDimension } from '../types';
import { Card, PageHeader, Spinner, ErrorBox, Empty, StatCard, KV } from '../components/ui';
import { StatusPill } from '../components/ui';
import { BarChart } from '../components/charts';

interface Usage {
  totalRequests?: number | null;
  totalUnits?: number | null;
  daily?: { date?: string | null; requests?: number | null }[] | null;
}

const cap = (v?: number | null) => (v === null || v === undefined ? '∞' : num(v, 0));

function Meter({ title, dim }: { title: string; dim?: LimitDimension | null }) {
  if (!dim) return <Card title={title} className="p-5"><Empty msg="No data." /></Card>;
  const used = dim.currentUsage ?? 0;
  const eff = dim.effectiveLimit;
  const pct = eff && eff > 0 ? Math.min(100, Math.max(0, (used / eff) * 100)) : 0;
  return (
    <Card title={title}>
      <div className="px-5 pt-4 pb-5">
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-extrabold tracking-tight mono">{num(used, 0)}</span>
          <span className="text-[color:var(--color-ink-soft)] text-lg font-semibold mono">/ {cap(eff)}</span>
        </div>
        <div className="mt-3 h-2.5 w-full rounded-full bg-black/[0.06] overflow-hidden">
          <div
            className="h-full rounded-full bg-[color:var(--color-brand-500)] transition-all"
            style={{ width: `${eff && eff > 0 ? pct : 0}%` }}
          />
        </div>
        <p className="mt-1.5 text-xs text-[color:var(--color-ink-soft)]">
          {eff && eff > 0 ? `${num(pct, 0)}% of effective limit` : 'Unlimited'}
        </p>
        <div className="mt-4">
          <KV k="Tier limit" v={<span className="mono">{cap(dim.tierLimit)}</span>} />
          <KV k="Self limit" v={<span className="mono">{cap(dim.selfLimit)}</span>} />
          <KV k="Remaining" v={<span className="mono">{cap(dim.remaining)}</span>} />
        </div>
      </div>
    </Card>
  );
}

export function Limits() {
  const network = useNetwork();
  const [limits, setLimits] = useState<LimitsT | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<ApiError | null>(null);

  useEffect(() => {
    if (!network) return;
    let live = true;
    setLoading(true);
    setErr(null);
    setLimits(null);
    setUsage(null);
    (async () => {
      try {
        const lim = await api.limits(network);
        if (!live) return;
        setLimits(lim);
      } catch (e) {
        if (live && e instanceof ApiError) setErr(e);
      }
      try {
        const u = (await api.usage(network, 30)) as Usage;
        if (live) setUsage(u);
      } catch {
        if (live) setUsage(null);
      }
      if (live) setLoading(false);
    })();
    return () => {
      live = false;
    };
  }, [network]);

  if (!network) return <Empty msg="Select a network to continue." />;

  const dailyBars =
    usage?.daily && Array.isArray(usage.daily)
      ? usage.daily.map((d) => ({ x: String(d?.date ?? ''), y: Number(d?.requests ?? 0) }))
      : [];

  return (
    <div>
      <PageHeader title="Provisioning limits" sub="GET /cpms/v1/limits · X-Network-Id" />

      {loading ? (
        <Spinner />
      ) : err ? (
        <ErrorBox error={err} />
      ) : !limits ? (
        <Empty msg="No limits available for this network." />
      ) : (
        <div className="space-y-6">
          <Card title="Plan">
            <div className="px-5 py-4">
              <KV k="Plan code" v={<StatusPill value={limits.planCode || '—'} tone="info" />} />
            </div>
          </Card>

          <div className="grid gap-6 md:grid-cols-2">
            <Meter title="Chargers" dim={limits.chargers} />
            <Meter title="Connectors" dim={limits.connectors} />
          </div>

          <Card title="API usage (30d)">
            <div className="px-5 pt-5 pb-5 space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <StatCard label="Total requests" value={<span className="mono">{num(usage?.totalRequests ?? 0, 0)}</span>} accent />
                <StatCard label="Total units" value={<span className="mono">{num(usage?.totalUnits ?? 0, 0)}</span>} />
              </div>
              {dailyBars.length > 0 ? (
                <div>
                  <p className="text-[13px] font-semibold text-[color:var(--color-ink-soft)] mb-2">Daily requests</p>
                  <BarChart data={dailyBars} fmt={(v) => num(v, 0)} />
                </div>
              ) : (
                <Empty msg="No daily usage data." />
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
