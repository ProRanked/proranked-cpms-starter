import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useNetwork } from '../App';
import { api, ApiError, money, num, when, dur } from '../api';
import { useResource } from '../hooks';
import {
  PageHeader, Spinner, ErrorBox, Empty, StatCard, Table, StatusPill, Card,
  Btn, Modal, Field, Input, Select, Notice,
} from '../components/ui';

// Server-side status filter values — public CPMS exposes these session states.
const STATUSES = ['Active', 'Charging', 'SuspendedEV', 'SuspendedEVSE', 'Pending', 'Completed', 'Stopped', 'Faulted'];

export function Sessions() {
  const network = useNetwork();

  // server-side filters → re-fetch on change
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const res = useResource(
    () => api.sessions(network, { status: status || undefined, from: from || undefined, to: to || undefined }),
    [network, status, from, to],
    !!network,
  );
  const rows = res.data?.data ?? [];

  // page-level action result (export + remote-start success)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);

  // export CSV
  const [exporting, setExporting] = useState(false);
  async function doExport() {
    setExporting(true); setNotice(null);
    try {
      await api.exportReport(network, 'sessions', { from: from || undefined, to: to || undefined });
      setNotice({ tone: 'ok', text: 'Sessions CSV export downloaded.' });
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError(0, 'error', String(e));
      setNotice({ tone: 'bad', text: `${err.code} (${err.status}) — ${err.message}` });
    } finally { setExporting(false); }
  }

  // new session (RemoteStart)
  const [showNew, setShowNew] = useState(false);
  const [chargerId, setChargerId] = useState('');
  const [connectorId, setConnectorId] = useState('');
  const [idTag, setIdTag] = useState('');
  const [starting, setStarting] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);

  const chargers = useResource(() => api.chargers(network), [network], !!network && showNew);

  function openNew() {
    setChargerId(''); setConnectorId(''); setIdTag(''); setFormErr(null);
    setShowNew(true);
  }

  async function doStart() {
    if (!chargerId) { setFormErr('Select a charger.'); return; }
    setStarting(true); setFormErr(null);
    try {
      await api.remoteStart(network, chargerId, {
        idTag: idTag || undefined,
        connectorId: connectorId ? Number(connectorId) : undefined,
      });
      setShowNew(false);
      setNotice({ tone: 'ok', text: 'RemoteStart command sent. The session appears once the charger accepts.' });
      res.reload();
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError(0, 'error', String(e));
      setFormErr(err.status === 403
        ? `${err.message} — needs cpms:command:* (may be off by default for non-Admin operators).`
        : `${err.code} (${err.status}) — ${err.message}`);
    } finally { setStarting(false); }
  }

  const totals = useMemo(() => {
    const energy = rows.reduce((s, r) => s + (r.energyKwh ?? 0), 0);
    const revenue = rows.reduce((s, r) => s + (r.total ?? 0), 0);
    return { count: rows.length, energy, revenue, ccy: rows[0]?.currency ?? 'USD' };
  }, [rows]);

  if (!network) {
    return (
      <>
        <PageHeader title="Sessions" sub="GET /cpms/v1/sessions" />
        <Empty msg="Select a network." />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Sessions"
        sub="GET /cpms/v1/sessions · POST /cpms/v1/chargers/{id}/remote-start · GET /cpms/v1/reports/export"
        right={
          <>
            <Btn onClick={doExport} loading={exporting}>Export CSV</Btn>
            <Btn variant="primary" onClick={openNew}>New session</Btn>
          </>
        }
      />

      {notice && <div className="mb-4"><Notice tone={notice.tone}>{notice.text}</Notice></div>}

      <div className="grid gap-4 sm:grid-cols-3 mb-5">
        <StatCard label="Sessions (filtered)" value={num(totals.count, 0)} />
        <StatCard label="Energy delivered" value={`${num(totals.energy)} kWh`} />
        <StatCard label="Revenue" value={money(totals.revenue, totals.ccy)} accent />
      </div>

      <Card className="p-4 mb-5">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Status">
            <Select value={status} onChange={setStatus}>
              <option value="">All statuses</option>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          </Field>
          <Field label="From">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="To">
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
          {(status || from || to) && (
            <Btn size="sm" onClick={() => { setStatus(''); setFrom(''); setTo(''); }}>Clear</Btn>
          )}
        </div>
      </Card>

      {res.loading ? (
        <Spinner label="Loading sessions…" />
      ) : res.error ? (
        <ErrorBox error={res.error} />
      ) : rows.length === 0 ? (
        <Empty msg="No charging sessions match these filters." />
      ) : (
        <Table
          columns={['Session', 'Charger', 'Energy (kWh)', 'Cost', 'Status', 'Started', 'Duration']}
          numeric={[2, 3]}
          rows={rows.map((s) => [
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

      {showNew && (
        <Modal title="New session — RemoteStart" onClose={() => setShowNew(false)}>
          <div className="space-y-4">
            <Notice tone="info">
              Sends a RemoteStartTransaction to the selected charger. The session row appears once the charger accepts and reports it.
            </Notice>

            <Field label="Charger">
              {chargers.loading ? (
                <Spinner label="Loading chargers…" />
              ) : chargers.error ? (
                <ErrorBox error={chargers.error} />
              ) : (
                <Select value={chargerId} onChange={setChargerId} className="w-full">
                  <option value="">Select a charger…</option>
                  {(chargers.data?.data ?? []).map((c) => (
                    <option key={c.id} value={c.id}>{c.uid} · {c.status}</option>
                  ))}
                </Select>
              )}
            </Field>

            <Field label="Connector ID (optional)">
              <Input
                type="number" min={1} placeholder="e.g. 1"
                value={connectorId} onChange={(e) => setConnectorId(e.target.value)}
              />
            </Field>

            <Field label="ID tag (driver token)">
              <Input
                className="mono" placeholder="e.g. RFID-04A1B2C3"
                value={idTag} onChange={(e) => setIdTag(e.target.value)}
              />
            </Field>

            {formErr && <Notice tone="bad">{formErr}</Notice>}

            <div className="flex justify-end gap-2">
              <Btn onClick={() => setShowNew(false)}>Cancel</Btn>
              <Btn variant="primary" onClick={doStart} loading={starting} disabled={!chargerId}>Send RemoteStart</Btn>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
