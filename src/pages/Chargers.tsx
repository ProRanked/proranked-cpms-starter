import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useNetwork } from '../App';
import { api, ApiError, f } from '../api';
import type { ChargerSummary } from '../types';
import { PageHeader, Spinner, ErrorBox, Empty, Table, StatusPill } from '../components/ui';

const ALL = 'All';

export function Chargers() {
  const network = useNetwork();
  const [chargers, setChargers] = useState<ChargerSummary[]>([]);
  const [err, setErr] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<string>(ALL);

  useEffect(() => {
    if (!network) {
      setLoading(false);
      return;
    }
    let live = true;
    setLoading(true);
    setErr(null);
    api
      .chargers(network)
      .then((r) => { if (live) setChargers(r.data); })
      .catch((e) => { if (live && e instanceof ApiError) setErr(e); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [network]);

  // Distinct statuses with counts, computed over the full unfiltered set.
  const statusCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of chargers) {
      const s = c.status || 'unknown';
      m.set(s, (m.get(s) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [chargers]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return chargers.filter((c) => {
      if (status !== ALL && (c.status || 'unknown') !== status) return false;
      if (!needle) return true;
      return [c.uid, c.serialNumber, c.id]
        .some((v) => (v ?? '').toString().toLowerCase().includes(needle));
    });
  }, [chargers, q, status]);

  if (!network) {
    return (
      <>
        <PageHeader title="Chargers" sub="GET /cpms/v1/chargers · X-Network-Id" />
        <Empty msg="Select a network to continue." />
      </>
    );
  }

  const chip = (label: string, count: number, active: boolean) => (
    <button
      key={label}
      onClick={() => setStatus(label)}
      className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
        active
          ? 'bg-[color:var(--color-brand-500)] text-white'
          : 'border border-black/10 text-[color:var(--color-ink-soft)] hover:bg-black/[0.03]'
      }`}
    >
      {label} <span className="opacity-70">{count}</span>
    </button>
  );

  return (
    <>
      <PageHeader
        title="Chargers"
        sub="GET /cpms/v1/chargers · X-Network-Id"
        right={<span className="text-sm text-[color:var(--color-ink-soft)]">{chargers.length} total</span>}
      />

      {loading ? (
        <Spinner />
      ) : err ? (
        <ErrorBox error={err} />
      ) : chargers.length === 0 ? (
        <Empty msg="No chargers in this network yet." />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search uid, serial, or id…"
              className="w-64 max-w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
            />
            <div className="flex flex-wrap items-center gap-2">
              {chip(ALL, chargers.length, status === ALL)}
              {statusCounts.map(([s, n]) => chip(s, n, status === s))}
            </div>
          </div>

          {filtered.length === 0 ? (
            <Empty msg="No chargers match your filters." />
          ) : (
            <Table
              columns={['Charger', 'Status', 'OCPP', 'Location', 'Firmware', 'Serial']}
              rows={filtered.map((c) => {
                const r = c as unknown as Record<string, unknown>;
                return [
                  <Link to={'/chargers/' + c.id} className="mono text-[color:var(--color-brand-600)] hover:underline">
                    {f(r, 'uid')}
                  </Link>,
                  <StatusPill value={c.status} />,
                  f(r, 'ocppVersion'),
                  f(r, 'locationName'),
                  f(r, 'firmwareVersion'),
                  <span className="mono">{f(r, 'serialNumber')}</span>,
                ];
              })}
            />
          )}
        </>
      )}
    </>
  );
}
