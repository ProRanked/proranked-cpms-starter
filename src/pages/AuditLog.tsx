import { useState } from 'react';
import { useNetwork } from '../App';
import { api, when } from '../api';
import { useResource } from '../hooks';
import { PageHeader, Spinner, ErrorBox, Empty, Table, StatusPill, Field, Input, Btn } from '../components/ui';

const PAGE_SIZE = 50;

export function AuditLog() {
  const network = useNetwork();
  const [category, setCategory] = useState('');
  const [action, setAction] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);

  // SERVER-side filtering + pagination — every filter/page change re-fetches with the new query.
  const log = useResource(
    () => api.auditLog(network, { category, action, from, to, page, pageSize: PAGE_SIZE }),
    [network, category, action, from, to, page],
    !!network,
  );

  // Resetting any filter returns to the first page (server paginates the filtered set).
  const reset = (set: (v: string) => void) => (v: string) => { set(v); setPage(1); };

  if (!network) return <Empty msg="Select a network to continue." />;

  const pg = log.data?.pagination;
  const total = pg?.total;
  const pageNo = pg?.page ?? page;
  const pageSize = pg?.pageSize ?? PAGE_SIZE;
  const totalPages = pg?.totalPages ?? (total !== undefined ? Math.max(1, Math.ceil(total / pageSize)) : undefined);
  const rows = log.data?.data ?? [];

  const right = total !== undefined
    ? <span className="text-sm text-[color:var(--color-ink-soft)] mono">{total.toLocaleString()} entries</span>
    : undefined;

  return (
    <div>
      <PageHeader title="Audit Log" sub="GET /cpms/v1/audit-log" right={right} />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <Field label="Category">
          <Input value={category} onChange={(e) => reset(setCategory)(e.target.value)} placeholder="e.g. charger" />
        </Field>
        <Field label="Action">
          <Input value={action} onChange={(e) => reset(setAction)(e.target.value)} placeholder="e.g. created" />
        </Field>
        <Field label="From">
          <Input type="date" value={from} onChange={(e) => reset(setFrom)(e.target.value)} />
        </Field>
        <Field label="To">
          <Input type="date" value={to} onChange={(e) => reset(setTo)(e.target.value)} />
        </Field>
      </div>

      {log.error ? (
        <ErrorBox error={log.error} />
      ) : log.loading ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <Empty msg={category || action || from || to ? 'No entries match the selected filters.' : 'No audit entries recorded for this network.'} />
      ) : (
        <div className="space-y-4">
          <Table
            dense
            columns={['When', 'Category', 'Action', 'Resource', 'Description', 'User', 'IP']}
            rows={rows.map((r) => [
              when(r.timestamp),
              <StatusPill value={r.category} tone="info" />,
              r.action,
              <span className="mono">{r.resourceName || r.resourceId || '—'}</span>,
              r.description,
              r.userName || '—',
              <span className="mono">{r.ipAddress || '—'}</span>,
            ])}
          />

          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-[color:var(--color-ink-soft)] mono">
              Page {pageNo}{totalPages !== undefined ? ` of ${totalPages}` : ''}
            </span>
            <div className="flex items-center gap-2">
              <Btn size="sm" disabled={pageNo <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>← Prev</Btn>
              <Btn size="sm" disabled={totalPages !== undefined ? pageNo >= totalPages : rows.length < pageSize} onClick={() => setPage((p) => p + 1)}>Next →</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
