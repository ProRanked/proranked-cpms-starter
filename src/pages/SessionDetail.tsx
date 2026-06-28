import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useNetwork } from '../App';
import { api, ApiError, money, num, when, dur } from '../api';
import type { SessionDetail as SessionDetailT, MeterValue, SessionEvent } from '../types';
import { Card, PageHeader, Spinner, ErrorBox, Empty, Table, StatusPill, KV, Btn, Modal, Input, Field, Notice } from '../components/ui';
import { LineCurve, AreaChart } from '../components/charts';
import { tokens } from '../tokens';

type Series = { name: string; color: string; points: { x: number; y: number }[] };
type ModalKind = 'stop' | 'refund' | 'waive' | null;

export function SessionDetail() {
  const network = useNetwork();
  const { id = '' } = useParams();

  const [session, setSession] = useState<SessionDetailT | null>(null);
  const [meters, setMeters] = useState<MeterValue[]>([]);
  const [events, setEvents] = useState<SessionEvent[]>([]);
  const [err, setErr] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);

  const [modal, setModal] = useState<ModalKind>(null);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [result, setResult] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);

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

  function openModal(kind: ModalKind) {
    setActionErr(null);
    setAmount('');
    setReason('');
    setModal(kind);
  }

  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(true);
    setActionErr(null);
    try {
      await fn();
      setModal(null);
      setAmount('');
      setReason('');
      setResult({ tone: 'ok', text: `${label} succeeded.` });
      setReload((r) => r + 1);
    } catch (e) {
      if (e instanceof ApiError) {
        setActionErr(e.status === 403
          ? `${e.message} — needs cpms:write:* / command scope (may be off by default).`
          : e.message);
      } else {
        setActionErr('Action failed.');
      }
    } finally {
      setBusy(false);
    }
  }

  const ccy = session?.currency || 'USD';
  const hasSoc = meters.some((m) => m.stateOfCharge !== null && m.stateOfCharge !== undefined);
  const hasCurrent = meters.some((m) => m.currentA !== null && m.currentA !== undefined);
  const hasVoltage = meters.some((m) => m.voltageA !== null && m.voltageA !== undefined);
  const hasTemp = meters.some((m) => m.temperature !== null && m.temperature !== undefined);

  // Primary curve: instantaneous power.
  const powerSeries: Series[] = [
    { name: 'Power kW', color: tokens.brand, points: meters.map((m, i) => ({ x: i, y: m.powerKw ?? 0 })) },
  ];
  // Secondary curve: per-phase current/voltage + battery SoC + pack temperature (only series that have data).
  const elecSeries: Series[] = [];
  if (hasCurrent) elecSeries.push({ name: 'Current A', color: tokens.warn, points: meters.map((m, i) => ({ x: i, y: m.currentA ?? 0 })) });
  if (hasVoltage) elecSeries.push({ name: 'Voltage V', color: tokens.bad, points: meters.map((m, i) => ({ x: i, y: m.voltageA ?? 0 })) });
  if (hasSoc) elecSeries.push({ name: 'SoC %', color: tokens.ok, points: meters.map((m, i) => ({ x: i, y: m.stateOfCharge ?? 0 })) });
  if (hasTemp) elecSeries.push({ name: 'Temp °C', color: tokens.mute, points: meters.map((m, i) => ({ x: i, y: m.temperature ?? 0 })) });
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
        sub="GET /cpms/v1/sessions/{id} · meter-values · events · POST force-stop/refund/waive-idle-fee · X-Network-Id"
        right={session ? (
          <>
            <Btn variant="ghost" onClick={() => openModal('waive')}>Waive idle fee</Btn>
            <Btn variant="ghost" onClick={() => openModal('refund')}>Refund</Btn>
            <Btn variant="danger" onClick={() => openModal('stop')}>Force stop</Btn>
          </>
        ) : undefined}
      />

      {result && (
        <div className="mb-5 flex items-start gap-2">
          <div className="flex-1"><Notice tone={result.tone}>{result.text}</Notice></div>
          <Btn variant="ghost" size="sm" onClick={() => setResult(null)}>Dismiss</Btn>
        </div>
      )}

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
                  <LineCurve series={powerSeries} height={220} fmt={(n) => `${num(n, 1)}`} />
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

          <Card title="Electrical telemetry · current / voltage / SoC / temperature" className="p-5 pt-0">
            {meters.length === 0 ? (
              <div className="pt-5"><Empty msg="No meter values for this session." /></div>
            ) : elecSeries.length === 0 ? (
              <div className="pt-5"><Empty msg="No current / voltage / SoC / temperature telemetry reported." /></div>
            ) : (
              <div className="pt-5">
                <LineCurve series={elecSeries} height={220} fmt={(n) => num(n, 1)} />
                <p className="mt-2 text-[11px] text-[color:var(--color-ink-soft)]">
                  Series share one axis — voltage typically dominates the scale; lower-magnitude series read flatter.
                </p>
              </div>
            )}
          </Card>

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
          {actionErr && <div className="mt-3"><Notice tone="bad">{actionErr}</Notice></div>}
          <div className="mt-6 flex justify-end gap-2">
            <Btn variant="ghost" onClick={() => setModal(null)} disabled={busy}>Cancel</Btn>
            <Btn variant="danger" loading={busy} disabled={busy} onClick={() => run('Force stop', () => api.forceStop(network, id, {}))}>
              Force stop
            </Btn>
          </div>
        </Modal>
      )}

      {modal === 'refund' && (
        <Modal title="Refund session" onClose={() => { if (!busy) setModal(null); }}>
          <div className="space-y-4">
            <Field label={`Amount (${ccy})`}>
              <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
            </Field>
            <Field label="Reason">
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Customer request" />
            </Field>
          </div>
          {actionErr && <div className="mt-3"><Notice tone="bad">{actionErr}</Notice></div>}
          <div className="mt-6 flex justify-end gap-2">
            <Btn variant="ghost" onClick={() => setModal(null)} disabled={busy}>Cancel</Btn>
            <Btn
              variant="primary"
              loading={busy}
              disabled={busy || !amount}
              onClick={() => run('Refund', () => api.refund(network, id, { amount: Number(amount), reason }))}
            >
              Refund
            </Btn>
          </div>
        </Modal>
      )}

      {modal === 'waive' && (
        <Modal title="Waive idle fee" onClose={() => { if (!busy) setModal(null); }}>
          <p className="text-sm text-[color:var(--color-ink-soft)]">
            Waives idle/parking charges for session <span className="mono">{id}</span>. Leave the amount blank to waive the full idle fee, or enter a partial amount.
          </p>
          <div className="mt-4 space-y-4">
            <Field label={`Amount (${ccy}, optional — blank = full)`}>
              <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="full idle fee" />
            </Field>
            <Field label="Reason (required)">
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. charger blocked the stall" />
            </Field>
          </div>
          {actionErr && <div className="mt-3"><Notice tone="bad">{actionErr}</Notice></div>}
          <div className="mt-6 flex justify-end gap-2">
            <Btn variant="ghost" onClick={() => setModal(null)} disabled={busy}>Cancel</Btn>
            <Btn
              variant="primary"
              loading={busy}
              disabled={busy || !reason.trim()}
              onClick={() => run('Waive idle fee', () => api.waiveIdleFee(network, id, {
                amount: amount ? Number(amount) : undefined,
                reason: reason.trim(),
              }))}
            >
              Waive idle fee
            </Btn>
          </div>
        </Modal>
      )}
    </>
  );
}
