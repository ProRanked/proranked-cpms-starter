import { useEffect, useMemo, useState } from 'react';
import { useNetwork } from '../App';
import { api, ApiError, when } from '../api';
import type { AuditEntry } from '../types';
import { PageHeader, Spinner, ErrorBox, Empty, Table, StatusPill } from '../components/ui';

export function AuditLog() {
  const network = useNetwork();
  const [rows, setRows] = useState<AuditEntry[] | null>(null);
  const [total, setTotal] = useState<number | undefined>(undefined);
  const [err, setErr] = useState<ApiError | null>(null);
  const [category, setCategory] = useState('');
  const [action, setAction] = useState('');

  useEffect(() => {
    if (!network) return;
    let live = true;
    setRows(null);
    setErr(null);
    setTotal(undefined);
    api
      .auditLog(network, { pageSize: 50 })
      .then((r) => {
        if (!live) return;
        setRows(r.data);
        setTotal(r.pagination?.total);
      })
      .catch((e) => {
        if (!live) return;
        if (e instanceof ApiError) setErr(e);
        else setRows([]);
      });
    return () => {
      live = false;
    };
  }, [network]);

  const categories = useMemo(
    () => Array.from(new Set((rows ?? []).map((r) => r.category).filter(Boolean))).sort(),
    [rows],
  );
  const actions = useMemo(
    () => Array.from(new Set((rows ?? []).map((r) => r.action).filter(Boolean))).sort(),
    [rows],
  );

  const filtered = useMemo(
    () =>
      (rows ?? []).filter(
        (r) => (!category || r.category === category) && (!action || r.action === action),
      ),
    [rows, category, action],
  );

  if (!network) return <Empty msg="Select a network to continue." />;

  const right = total !== undefined ? <span className="text-sm text-[color:var(--color-ink-soft)] mono">{total} entries</span> : undefined;

  return (
    <div>
      <PageHeader title="Audit Log" sub="GET /cpms/v1/audit-log" right={right} />

      {err ? (
        <ErrorBox error={err} />
      ) : rows === null ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <Empty msg="No audit entries recorded for this network." />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="rounded-lg border border-black/10 px-3 py-2 text-sm bg-white"
            >
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <select
              value={action}
              onChange={(e) => setAction(e.target.value)}
              className="rounded-lg border border-black/10 px-3 py-2 text-sm bg-white"
            >
              <option value="">All actions</option>
              {actions.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>

          {filtered.length === 0 ? (
            <Empty msg="No entries match the selected filters." />
          ) : (
            <Table
              dense
              columns={['When', 'Category', 'Action', 'Resource', 'Description', 'User', 'IP']}
              rows={filtered.map((r) => [
                when(r.timestamp),
                <StatusPill value={r.category} tone="info" />,
                r.action,
                <span className="mono">{r.resourceName || r.resourceId || '—'}</span>,
                r.description,
                r.userName || '—',
                <span className="mono">{r.ipAddress || '—'}</span>,
              ])}
            />
          )}
        </div>
      )}
    </div>
  );
}
