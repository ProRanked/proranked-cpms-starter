import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useNetwork } from '../App';
import { api, ApiError, money, num, when, dur } from '../api';
import type { SessionSummary } from '../types';
import { PageHeader, Spinner, ErrorBox, Empty, StatCard, Table, StatusPill, Card } from '../components/ui';

export function Sessions() {
  const network = useNetwork();
  const [rows, setRows] = useState<SessionSummary[]>([]);
  const [err, setErr] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('all');

  useEffect(() => {
    if (!network) { setLoading(false); return; }
    let live = true;
    setLoading(true);
    setErr(null);
    setStatus('all');
    api.sessions(network)
      .then((r) => { if (live) setRows(r.data); })
      .catch((e) => { if (live && e instanceof ApiError) setErr(e); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [network]);

  const statuses = useMemo(
    () => Array.from(new Set(rows.map((s) => s.status).filter(Boolean))).sort(),
    [rows],
  );

  const filtered = useMemo(
    () => (status === 'all' ? rows : rows.filter((s) => s.status === status)),
    [rows, status],
  );

  const totals = useMemo(() => {
    const energy = filtered.reduce((sum, s) => sum + (s.energyKwh ?? 0), 0);
    const revenue = filtered.reduce((sum, s) => sum + (s.total ?? 0), 0);
    return { count: filtered.length, energy, revenue, ccy: filtered[0]?.currency ?? 'USD' };
  }, [filtered]);

  if (!network) return <Empty msg="Select a network to continue." />;

  return (
    <>
      <PageHeader title="Sessions" sub="GET /cpms/v1/sessions · X-Network-Id" />
      {loading ? (
        <Spinner label="Loading sessions…" />
      ) : err ? (
        <ErrorBox error={err} />
      ) : rows.length === 0 ? (
        <Empty msg="No charging sessions in this network yet." />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3 mb-5">
            <StatCard label="Total sessions" value={num(totals.count, 0)} />
            <StatCard label="Energy delivered" value={`${num(totals.energy)} kWh`} />
            <StatCard label="Revenue" value={money(totals.revenue, totals.ccy)} accent />
          </div>

          <Card
            title="Charging sessions"
            right={
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="rounded-lg border border-black/10 bg-white px-3 py-1.5 text-sm"
              >
                <option value="all">All statuses</option>
                {statuses.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            }
          >
            {filtered.length === 0 ? (
              <Empty msg="No sessions match this status." />
            ) : (
              <Table
                columns={['Session', 'Charger', 'Energy (kWh)', 'Cost', 'Status', 'Started', 'Duration']}
                numeric={[2, 3]}
                rows={filtered.map((s) => [
                  <Link to={'/sessions/' + s.id} className="mono">{s.id}</Link>,
                  <span className="mono">{s.chargerUid ?? '—'}</span>,
                  num(s.energyKwh),
                  money(s.total, s.currency),
                  <StatusPill value={s.status} />,
                  when(s.startedAt),
                  dur(s.startedAt, s.endedAt),
                ])}
              />
            )}
          </Card>
        </>
      )}
    </>
  );
}
