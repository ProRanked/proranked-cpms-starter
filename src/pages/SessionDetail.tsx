import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useNetwork } from '../App';
import { api, ApiError, money, num, when, dur } from '../api';
import type { SessionDetail as SessionDetailT, MeterValue, SessionEvent } from '../types';
import { Card, PageHeader, Spinner, ErrorBox, Empty, Table, StatusPill, KV, Btn, Modal, Input } from '../components/ui';
import { LineCurve, AreaChart } from '../components/charts';

type Series = { name: string; color: string; points: { x: number; y: number }[] };

export function SessionDetail() {
  const network = useNetwork();
  const { id = '' } = useParams();

  const [session, setSession] = useState<SessionDetailT | null>(null);
  const [meters, setMeters] = useState<MeterValue[]>([]);
  const [events, setEvents] = useState<SessionEvent[]>([]);
  const [err, setErr] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);

  const [modal, setModal] = useState<'stop' | 'refund' | null>(null);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionErr, setActionErr] = useState<string | null>(null);

  useEffect(() => {
    if (!network || !id) { setLoading(false); return; }
    let live = true;
    setLoading(true);
    setErr(null);
    (async () => {
      try {
        const s = await api.session(network, id);
        if (!live) return;
        setSession(s);
        // Auxiliary curves/timeline fail soft — never crash the page.
        const [mv, ev] = await Promise.all([
          api.meterValues(network, id).catch(() => [] as MeterValue[]),
          api.sessionEvents(network, id).then((r) => r.data).catch(() => [] as SessionEvent[]),
        ]);
        if (!live) return;
        setMeters(mv);
        setEvents(ev);
      } catch (e) {
        if (live && e instanceof ApiError) setErr(e);
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => { live = false; };
  }, [network, id, reload]);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setActionErr(null);
    try {
      await fn();
      setModal(null);
      setAmount('');
      setReason('');
      setReload((r) => r + 1);
    } catch (e) {
      setActionErr(e instanceof ApiError ? e.message : 'Action failed.');
    } finally {
      setBusy(false);
    }
  }

  const ccy = session?.currency || 'USD';
  const hasSoc = meters.some((m) => m.stateOfCharge !== null && m.stateOfCharge !== undefined);
  const series: Series[] = [
    { name: 'Power kW', color: '#0a84ff', points: meters.map((m, i) => ({ x: i, y: m.powerKw ?? 0 })) },
  ];
  if (hasSoc) {
    series.push({ name: 'SoC %', color: '#10b981', points: meters.map((m, i) => ({ x: i, y: m.stateOfCharge ?? 0 })) });
  }
  const energyData = meters.map((m, i) => ({ x: String(i), y: m.meterValue ?? 0 }));

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Link to="/sessions" className="text-sm font-medium text-[color:var(--color-ink-soft)] hover:text-[color:var(--color-ink)]">← Sessions</Link>
        <span className="mono text-sm">{id}</span>
        {session && <StatusPill value={session.status} />}
      </div>

      <PageHeader
        title="Session"
        sub="GET /cpms/v1/sessions/{id} · meter-values · events · X-Network-Id"
        right={session ? (
          <>
            <Btn variant="ghost" onClick={() => setModal('refund')}>Refund</Btn>
            <Btn variant="danger" onClick={() => setModal('stop')}>Force stop</Btn>
          </>
        ) : undefined}
      />

      {!network ? (
        <Empty msg="Select a network to continue." />
      ) : loading ? (
        <Spinner />
      ) : err ? (
        <ErrorBox error={err} />
      ) : !session ? (
        <Empty msg="Session not found." />
      ) : (
        <div className="space-y-5">
          <div className="grid gap-5 lg:grid-cols-3">
            <Card title="Power curve" className="lg:col-span-2 p-5 pt-0">
              {meters.length === 0 ? (
                <div className="pt-5"><Empty msg="No meter values for this session." /></div>
              ) : (
                <div className="pt-5 space-y-6">
                  <LineCurve series={series} height={220} fmt={(n) => `${num(n, 1)}`} />
                  <div>
                    <p className="mb-1 text-[12px] font-semibold text-[color:var(--color-ink-soft)]">Cumulative energy (meter)</p>
                    <AreaChart data={energyData} height={140} fmt={(n) => num(n, 0)} />
                  </div>
                </div>
              )}
            </Card>

            <Card title="Details" className="p-5 pt-0">
              <div className="pt-4">
                <KV k="Energy" v={`${num(session.energyKwh)} kWh`} />
                <KV k="Current power" v={`${num(session.currentPowerKw)} kW`} />
                <KV k="Cost" v={money(session.total, ccy)} />
                <KV k="Started" v={when(session.startedAt)} />
                <KV k="Ended" v={when(session.endedAt)} />
                <KV k="Duration" v={dur(session.startedAt, session.endedAt)} />
                <KV k="Charger Id" v={<span className="mono">{session.chargerId}</span>} />
                <KV k="Currency" v={<span className="mono">{ccy}</span>} />
              </div>
            </Card>
          </div>

          <Card title="Timeline">
            {events.length === 0 ? (
              <div className="p-5"><Empty msg="No events recorded for this session." /></div>
            ) : (
              <Table
                columns={['Event', 'Details', 'When']}
                rows={events.map((e) => [
                  <StatusPill value={e.eventType || '—'} />,
                  e.details || '—',
                  when(e.occurredAt),
                ])}
                dense
              />
            )}
          </Card>
        </div>
      )}

      {modal === 'stop' && (
        <Modal title="Force stop session" onClose={() => { if (!busy) setModal(null); }}>
          <p className="text-sm text-[color:var(--color-ink-soft)]">
            This sends a remote stop to the charger for session <span className="mono">{id}</span>. The driver will be charged for energy delivered so far.
          </p>
          {actionErr && <p className="mt-3 text-sm text-red-600">{actionErr}</p>}
          <div className="mt-6 flex justify-end gap-2">
            <Btn variant="ghost" onClick={() => setModal(null)} disabled={busy}>Cancel</Btn>
            <Btn variant="danger" disabled={busy} onClick={() => run(() => api.forceStop(network, id, {}))}>
              {busy ? 'Stopping…' : 'Force stop'}
            </Btn>
          </div>
        </Modal>
      )}

      {modal === 'refund' && (
        <Modal title="Refund session" onClose={() => { if (!busy) setModal(null); }}>
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Amount ({ccy})</label>
              <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Reason</label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Customer request" />
            </div>
          </div>
          {actionErr && <p className="mt-3 text-sm text-red-600">{actionErr}</p>}
          <div className="mt-6 flex justify-end gap-2">
            <Btn variant="ghost" onClick={() => setModal(null)} disabled={busy}>Cancel</Btn>
            <Btn
              variant="primary"
              disabled={busy || !amount}
              onClick={() => run(() => api.refund(network, id, { amount: Number(amount), reason }))}
            >
              {busy ? 'Refunding…' : 'Refund'}
            </Btn>
          </div>
        </Modal>
      )}
    </>
  );
}
