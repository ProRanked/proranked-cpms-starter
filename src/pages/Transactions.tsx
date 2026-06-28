import { useEffect, useState } from 'react';
import { useNetwork } from '../App';
import { api, ApiError, f, money, num, when } from '../api';
import type { TxSummary } from '../types';
import { PageHeader, Spinner, ErrorBox, Empty, StatCard, Table, StatusPill, KV, Modal } from '../components/ui';

export function Transactions() {
  const network = useNetwork();
  const [rows, setRows] = useState<TxSummary[]>([]);
  const [err, setErr] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    if (!network) { setLoading(false); return; }
    let live = true;
    setLoading(true);
    setErr(null);
    api
      .transactions(network)
      .then((r) => { if (live) setRows(r.data); })
      .catch((e) => { if (live && e instanceof ApiError) setErr(e); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [network]);

  const totalRevenue = rows.reduce((s, t) => s + (t.amount ?? 0), 0);
  const totalNet = rows.reduce((s, t) => s + (t.netProfit ?? 0), 0);
  const ccy = rows.find((t) => t.currency)?.currency ?? undefined;

  return (
    <>
      <PageHeader title="Transactions" sub="GET /cpms/v1/transactions" />
      {!network ? (
        <Empty msg="Select a network to continue." />
      ) : loading ? (
        <Spinner />
      ) : err ? (
        <ErrorBox error={err} />
      ) : rows.length === 0 ? (
        <Empty msg="No transactions (CDRs) in this network yet." />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
            <StatCard label="Total revenue" value={money(totalRevenue, ccy)} hint="Sum of CDR amounts" accent />
            <StatCard label="Net profit" value={money(totalNet, ccy)} hint="Sum of net profit" />
            <StatCard label="Sessions" value={num(rows.length, 0)} hint="Billed CDRs" />
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
      {openId && network && <TxModal network={network} id={openId} onClose={() => setOpenId(null)} />}
    </>
  );
}

function TxModal({ network, id, onClose }: { network: string; id: string; onClose: () => void }) {
  const [tx, setTx] = useState<Record<string, unknown> | null>(null);
  const [err, setErr] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setErr(null);
    api
      .transaction(network, id)
      .then((d) => { if (live) setTx(d as Record<string, unknown>); })
      .catch((e) => { if (live && e instanceof ApiError) setErr(e); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [network, id]);

  const ccy = tx ? f(tx, 'currency') : undefined;
  const cur = ccy && ccy !== '—' ? ccy : undefined;
  const n = (k: string) => {
    const v = tx?.[k];
    return typeof v === 'number' ? v : undefined;
  };

  return (
    <Modal title="Transaction / CDR" onClose={onClose}>
      {loading ? (
        <Spinner />
      ) : err ? (
        <ErrorBox error={err} />
      ) : !tx ? (
        <Empty msg="Transaction not found." />
      ) : (
        <div className="space-y-4">
          <div>
            <KV k="CDR" v={<span className="mono">{f(tx, 'id')}</span>} />
            <KV k="OCPI ID" v={<span className="mono">{f(tx, 'ocpiId')}</span>} />
            <KV k="Session" v={<span className="mono">{f(tx, 'sessionId')}</span>} />
            <KV k="Charger" v={<span className="mono">{f(tx, 'chargerUid')}</span>} />
            <KV k="Location" v={f(tx, 'locationName')} />
            <KV k="Start" v={when(f(tx, 'startTime'))} />
            <KV k="End" v={when(f(tx, 'endTime'))} />
            <KV k="Energy" v={num(n('energyKwh')) + ' kWh'} />
            <KV k="Payment" v={<StatusPill value={f(tx, 'paymentStatus')} />} />
          </div>
          <div className="border-t border-white/10 pt-3">
            <KV k="Amount (gross)" v={money(n('amount'), cur)} />
            <KV k="Total costs" v={money(n('totalCosts'), cur)} />
            <KV k="Gross profit" v={money(n('grossProfit'), cur)} />
            <KV k="Net profit" v={money(n('netProfit'), cur)} />
            <KV k="Margin" v={num(n('profitMarginPercent'), 1) + '%'} />
            <KV k="Payout" v={money(n('payout'), cur)} />
            <KV k="Free" v={tx.isFree ? 'Yes' : 'No'} />
          </div>
          <details className="text-xs">
            <summary className="cursor-pointer opacity-70 hover:opacity-100">Raw response</summary>
            <pre className="mono mt-2 overflow-auto rounded bg-black/30 p-3">{JSON.stringify(tx, null, 2)}</pre>
          </details>
        </div>
      )}
    </Modal>
  );
}
