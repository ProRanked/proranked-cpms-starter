import { useState } from 'react';
import { useNetwork } from '../App';
import { api, ApiError, f, money, num, when } from '../api';
import { useResource } from '../hooks';
import {
  PageHeader, Card, Spinner, ErrorBox, Empty, StatCard, Table, StatusPill, KV, Modal,
  Btn, Field, Input, Textarea, Notice,
} from '../components/ui';

type Filters = { from: string; to: string; chargerId: string };
const EMPTY: Filters = { from: '', to: '', chargerId: '' };
const clean = (f: Filters) => ({ from: f.from || undefined, to: f.to || undefined, chargerId: f.chargerId || undefined });

export function Transactions() {
  const network = useNetwork();
  const [draft, setDraft] = useState<Filters>(EMPTY);
  const [applied, setApplied] = useState<Filters>(EMPTY);
  const [openId, setOpenId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);

  const txs = useResource(() => api.transactions(network, clean(applied)), [network, applied], !!network);
  const rows = txs.data?.data ?? [];

  const totalRevenue = rows.reduce((s, t) => s + (t.amount ?? 0), 0);
  const totalNet = rows.reduce((s, t) => s + (t.netProfit ?? 0), 0);
  const ccy = rows.find((t) => t.currency)?.currency ?? undefined;
  const filtered = applied.from || applied.to || applied.chargerId;

  const exportCsv = async () => {
    setExporting(true); setExportMsg(null);
    try {
      await api.exportTransactions(network, { from: applied.from || undefined, to: applied.to || undefined });
      setExportMsg({ tone: 'ok', text: 'CDR export (CSV) downloaded.' });
    } catch (e) {
      setExportMsg({
        tone: 'bad',
        text: e instanceof ApiError
          ? (e.status === 403 ? 'Export denied — needs cpms:read / may be off by default.' : `${e.code}: ${e.message}`)
          : String(e),
      });
    } finally { setExporting(false); }
  };

  return (
    <>
      <PageHeader
        title="Transactions"
        sub="GET /cpms/v1/transactions · GET /cpms/v1/transactions/export · POST /cpms/v1/sessions/{id}/refund"
        right={<Btn variant="primary" onClick={exportCsv} loading={exporting} disabled={!network}>Export CSV</Btn>}
      />
      {exportMsg && <div className="mb-4"><Notice tone={exportMsg.tone}>{exportMsg.text}</Notice></div>}

      {!network ? (
        <Empty msg="Select a network." />
      ) : (
        <>
          <Card className="p-4 mb-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
              <Field label="From">
                <Input type="date" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} />
              </Field>
              <Field label="To">
                <Input type="date" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} />
              </Field>
              <Field label="Charger ID">
                <Input className="mono" placeholder="charger uid / id" value={draft.chargerId} onChange={(e) => setDraft({ ...draft, chargerId: e.target.value })} />
              </Field>
              <div className="flex items-center gap-2">
                <Btn variant="primary" onClick={() => setApplied(draft)}>Apply</Btn>
                <Btn onClick={() => { setDraft(EMPTY); setApplied(EMPTY); }} disabled={!filtered && !draft.from && !draft.to && !draft.chargerId}>Reset</Btn>
              </div>
            </div>
          </Card>

          {txs.loading ? (
            <Spinner />
          ) : txs.error ? (
            <ErrorBox error={txs.error} />
          ) : rows.length === 0 ? (
            <Empty msg={filtered ? 'No transactions match these filters.' : 'No transactions (CDRs) in this network yet.'} />
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
                <StatCard label="Total revenue" value={money(totalRevenue, ccy)} hint="Sum of CDR amounts" accent />
                <StatCard label="Net profit" value={money(totalNet, ccy)} hint="Sum of net profit" />
                <StatCard label="Sessions" value={num(rows.length, 0)} hint={filtered ? 'Billed CDRs (filtered)' : 'Billed CDRs'} />
              </div>
              <Table
                numeric={[3, 4, 5, 6]}
                columns={['CDR', 'Charger', 'Location', 'Energy', 'Amount', 'Net profit', 'Margin', 'Payment', 'Start']}
                rows={rows.map((t) => [
                  <button className="mono link" onClick={() => setOpenId(t.id)}>{t.id}</button>,
                  <span className="mono">{t.chargerUid ?? '—'}</span>,
                  t.locationName ?? '—',
                  num(t.energyKwh),
                  money(t.amount, t.currency ?? undefined),
                  money(t.netProfit, t.currency ?? undefined),
                  num(t.profitMarginPercent, 1) + '%',
                  <StatusPill value={t.paymentStatus ?? '—'} />,
                  when(t.startTime),
                ])}
              />
            </>
          )}
        </>
      )}

      {openId && network && <TxModal network={network} id={openId} onClose={() => setOpenId(null)} onChanged={txs.reload} />}
    </>
  );
}

function TxModal({ network, id, onClose, onChanged }: { network: string; id: string; onClose: () => void; onChanged: () => void }) {
  const txr = useResource(() => api.transaction(network, id), [network, id]);
  const tx = txr.data as Record<string, unknown> | null;

  const [rfOpen, setRfOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);

  const ccy = tx ? f(tx, 'currency') : undefined;
  const cur = ccy && ccy !== '—' ? ccy : undefined;
  const n = (k: string) => { const v = tx?.[k]; return typeof v === 'number' ? v : undefined; };
  const sessionId = tx ? f(tx, 'sessionId') : '—';
  const hasSession = !!tx && sessionId !== '—';

  const submitRefund = async () => {
    setBusy(true); setMsg(null);
    try {
      const body: Record<string, unknown> = {};
      if (amount.trim()) body.amount = Number(amount);
      if (reason.trim()) body.reason = reason.trim();
      await api.refund(network, sessionId, body);
      setMsg({ tone: 'ok', text: `Refund submitted for session ${sessionId}.` });
      setRfOpen(false); setAmount(''); setReason('');
      txr.reload(); onChanged();
    } catch (e) {
      setMsg({
        tone: 'bad',
        text: e instanceof ApiError
          ? (e.status === 403 ? 'Refund denied — needs cpms:write:billing / may be off by default.' : `${e.code}: ${e.message}`)
          : String(e),
      });
    } finally { setBusy(false); }
  };

  return (
    <Modal title="Transaction / CDR" onClose={onClose}>
      {txr.loading ? (
        <Spinner />
      ) : txr.error ? (
        <ErrorBox error={txr.error} />
      ) : !tx ? (
        <Empty msg="Transaction not found." />
      ) : (
        <div className="space-y-4">
          {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
          <div>
            <KV k="CDR" v={<span className="mono">{f(tx, 'id')}</span>} />
            <KV k="OCPI ID" v={<span className="mono">{f(tx, 'ocpiId')}</span>} />
            <KV k="Session" v={<span className="mono">{sessionId}</span>} />
            <KV k="Charger" v={<span className="mono">{f(tx, 'chargerUid')}</span>} />
            <KV k="Location" v={f(tx, 'locationName')} />
            <KV k="Start" v={when(f(tx, 'startTime'))} />
            <KV k="End" v={when(f(tx, 'endTime'))} />
            <KV k="Energy" v={num(n('energyKwh')) + ' kWh'} />
            <KV k="Payment" v={<StatusPill value={f(tx, 'paymentStatus')} />} />
          </div>
          <div className="border-t border-black/5 pt-3">
            <KV k="Amount (gross)" v={money(n('amount'), cur)} />
            <KV k="Total costs" v={money(n('totalCosts'), cur)} />
            <KV k="Gross profit" v={money(n('grossProfit'), cur)} />
            <KV k="Net profit" v={money(n('netProfit'), cur)} />
            <KV k="Margin" v={num(n('profitMarginPercent'), 1) + '%'} />
            <KV k="Payout" v={money(n('payout'), cur)} />
            <KV k="Free" v={tx.isFree ? 'Yes' : 'No'} />
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-black/5 pt-3">
            <Btn variant="danger" onClick={() => { setMsg(null); setRfOpen(true); }} disabled={!hasSession}>Refund…</Btn>
          </div>
          {!hasSession && <p className="text-xs text-[color:var(--color-ink-soft)] text-right -mt-2">Refund needs a linked session.</p>}
          <details className="text-xs">
            <summary className="cursor-pointer opacity-70 hover:opacity-100">Raw response</summary>
            <pre className="mono mt-2 overflow-auto rounded bg-black/5 p-3">{JSON.stringify(tx, null, 2)}</pre>
          </details>
        </div>
      )}

      {rfOpen && (
        <Modal title="Refund session" onClose={() => setRfOpen(false)}>
          <div className="space-y-4">
            <Notice tone="info">
              Refunds session <span className="mono">{sessionId}</span>. Leave amount blank for a full refund.
            </Notice>
            <Field label={`Amount${cur ? ` (${cur})` : ''} — optional, partial`}>
              <Input type="number" step="0.01" min="0" placeholder="full refund if blank" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </Field>
            <Field label="Reason">
              <Textarea rows={3} placeholder="Reason for the refund (e.g. faulty session, customer dispute)" value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
            <div className="flex items-center justify-end gap-2">
              <Btn onClick={() => setRfOpen(false)}>Cancel</Btn>
              <Btn variant="danger" onClick={submitRefund} loading={busy}>Submit refund</Btn>
            </div>
          </div>
        </Modal>
      )}
    </Modal>
  );
}
