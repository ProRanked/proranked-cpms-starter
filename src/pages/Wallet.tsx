import { useState } from 'react';
import { useNetwork } from '../App';
import { api, ApiError, money, num, when } from '../api';
import type { NetworkWallet } from '../types';
import {
  Card, PageHeader, Spinner, ErrorBox, Empty, KV, StatusPill,
  Btn, Modal, Input, Field, Notice, Table,
} from '../components/ui';
import { useResource } from '../hooks';

// The public CPMS API has no driver roster (documented gap) — operators paste a known driver UUID to
// inspect/fund the per-network credit wallet. GET /cpms/v1/wallets/{driverId} + GET /fraud/drivers/{driverId}.

interface WalletLookup { driverId: string; wallets: NetworkWallet[] }
interface FraudDriver {
  driverId?: string | null; email?: string | null;
  phoneVerified?: boolean; fraudHold?: boolean;
  outstandingBalance?: number; currency?: string | null;
  reason?: string | null; heldAt?: string | null;
  [k: string]: unknown;
}

type Toast = { tone: 'ok' | 'bad'; msg: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const yesNo = (b?: boolean) => (b ? 'Yes' : 'No');

/** POST /cpms/v1/wallets/credit — operator-funded grant to a driver's per-network credit wallet. */
function CreditModal({ network, driverId, defaultCurrency, onClose, onSaved }: {
  network: string; driverId: string; defaultCurrency: string; onClose: () => void; onSaved: (t: Toast) => void;
}) {
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState(defaultCurrency);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const amt = Number(amount);
  const ccy = currency.trim().toUpperCase();
  const invalid = amount.trim() === '' || !Number.isFinite(amt) || amt <= 0 || ccy.length !== 3;

  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      await api.creditWallet(network, { driverId, amount: amt, currency: ccy, reason: reason.trim() || undefined });
      onSaved({ tone: 'ok', msg: `Granted ${money(amt, ccy)} credit to the driver wallet.` });
      onClose();
    } catch (e) {
      const m = e instanceof ApiError
        ? `${e.message}${e.status === 403 ? ' — needs cpms:write:wallets / Admin role (may be off by default)' : ''}`
        : String((e as Error)?.message ?? e);
      setErr(m);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Grant wallet credit" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-xs text-[color:var(--color-ink-soft)]">
          Adds operator-funded credit to this driver's wallet for the active network.
        </p>
        <KV k="Driver" v={<span className="mono">{driverId}</span>} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount">
            <Input type="number" min={0} step="0.01" value={amount} placeholder="e.g. 25.00"
              onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label="Currency">
            <Input value={currency} maxLength={3} placeholder="USD"
              onChange={(e) => setCurrency(e.target.value)} className="uppercase" />
          </Field>
        </div>
        <Field label="Reason">
          <Input value={reason} placeholder="Goodwill credit, refund, promo…"
            onChange={(e) => setReason(e.target.value)} />
        </Field>
        {invalid && <Notice tone="bad">Enter a positive amount and a 3-letter currency code.</Notice>}
        {err && <Notice tone="bad">{err}</Notice>}
        <div className="flex justify-end gap-2 pt-1">
          <Btn variant="ghost" onClick={onClose} disabled={busy}>Cancel</Btn>
          <Btn variant="primary" onClick={submit} loading={busy} disabled={invalid}>Grant credit</Btn>
        </div>
      </div>
    </Modal>
  );
}

export function Wallet() {
  const network = useNetwork();
  const [driverInput, setDriverInput] = useState('');
  const [lookupId, setLookupId] = useState('');
  const [creditOpen, setCreditOpen] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  const wallets = useResource<WalletLookup>(
    () => api.wallet(network, lookupId), [network, lookupId], !!network && !!lookupId,
  );
  const fraud = useResource<FraudDriver>(
    () => api.fraudDriver(network, lookupId), [network, lookupId], !!network && !!lookupId,
  );

  if (!network) return <Empty msg="Select a network." />;

  const doLookup = () => {
    const id = driverInput.trim();
    if (!UUID_RE.test(id)) { setToast({ tone: 'bad', msg: 'Enter a valid driver UUID (e.g. 8 chars-4-4-4-12).' }); return; }
    setToast(null);
    if (id === lookupId) { wallets.reload(); fraud.reload(); }
    else setLookupId(id);
  };

  const rows = wallets.data?.wallets ?? [];
  const defaultCurrency = (rows[0]?.currency || fraud.data?.currency || 'USD').toUpperCase();

  const onSaved = (t: Toast) => { setToast(t); wallets.reload(); fraud.reload(); };

  return (
    <div>
      <PageHeader
        title="Driver wallet"
        sub="/cpms/v1/wallets + /fraud/drivers"
        right={lookupId && (
          <Btn variant="primary" onClick={() => setCreditOpen(true)}>Grant credit</Btn>
        )}
      />

      {toast && <div className="mb-4"><Notice tone={toast.tone}>{toast.msg}</Notice></div>}

      <Card className="p-5 mb-6">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[280px]">
            <Field label="Driver UUID">
              <Input
                value={driverInput}
                placeholder="00000000-0000-0000-0000-000000000000"
                className="mono"
                onChange={(e) => setDriverInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') doLookup(); }}
              />
            </Field>
          </div>
          <Btn variant="primary" onClick={doLookup} loading={wallets.loading || fraud.loading}>Look up</Btn>
        </div>
        <p className="mt-2 text-xs text-[color:var(--color-ink-soft)]">
          The public API has no driver roster (documented gap) — paste a known driver UUID to inspect and fund
          their per-network credit wallet.
        </p>
      </Card>

      {!lookupId ? (
        <Empty msg="Paste a driver UUID above and look up." />
      ) : (
        <div className="space-y-6">
          {/* Wallets */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-[color:var(--color-ink)]">Wallets · <span className="mono">{lookupId}</span></h3>
              <Btn size="sm" variant="ghost" onClick={wallets.reload} loading={wallets.loading}>Refresh</Btn>
            </div>
            {wallets.loading ? (
              <Spinner />
            ) : wallets.error ? (
              <ErrorBox error={wallets.error} />
            ) : rows.length === 0 ? (
              <Empty msg="No wallets for this driver on the accessible networks." />
            ) : (
              <Table
                columns={['Network', 'Balance', 'Currency', 'Status', 'Last transaction']}
                numeric={[1]}
                rows={rows.map((w: NetworkWallet) => [
                  <span className="mono">{w.networkId}</span>,
                  <span className="font-semibold">{money(w.balance, w.currency)}</span>,
                  <span className="mono">{w.currency || '—'}</span>,
                  <StatusPill value={w.status || '—'} />,
                  when(w.lastTransactionAt),
                ])}
              />
            )}
          </div>

          {/* Fraud / risk */}
          <Card title="Fraud & risk status" right={<Btn size="sm" variant="ghost" onClick={fraud.reload} loading={fraud.loading}>Refresh</Btn>}>
            <div className="px-5 py-4">
              {fraud.loading ? (
                <Spinner />
              ) : fraud.error ? (
                <ErrorBox error={fraud.error} />
              ) : !fraud.data ? (
                <Empty msg="No fraud record for this driver." />
              ) : (
                <>
                  <KV k="Phone verified" v={<StatusPill value={yesNo(fraud.data.phoneVerified)} tone={fraud.data.phoneVerified ? 'ok' : 'warn'} />} />
                  <KV k="Fraud hold" v={<StatusPill value={yesNo(fraud.data.fraudHold)} tone={fraud.data.fraudHold ? 'bad' : 'ok'} />} />
                  <KV k="Outstanding balance" v={<span className="mono">{fraud.data.outstandingBalance != null ? money(fraud.data.outstandingBalance, defaultCurrency) : '—'}</span>} />
                  {fraud.data.email && <KV k="Email" v={<span className="mono">{fraud.data.email}</span>} />}
                  {fraud.data.reason && <KV k="Hold reason" v={fraud.data.reason} />}
                  {fraud.data.heldAt && <KV k="Held at" v={when(fraud.data.heldAt)} />}
                  {fraud.data.outstandingBalance != null && fraud.data.outstandingBalance > 0 && (
                    <div className="mt-3">
                      <Notice tone="bad">
                        Driver has an outstanding balance of {money(fraud.data.outstandingBalance, defaultCurrency)}
                        {fraud.data.fraudHold ? ' and is on a fraud hold.' : '.'} Granting credit will not clear the hold.
                      </Notice>
                    </div>
                  )}
                </>
              )}
            </div>
          </Card>

          <p className="text-xs text-[color:var(--color-ink-soft)] mono">
            balances {num(rows.length, 0)} wallet(s) · driver {lookupId}
          </p>
        </div>
      )}

      {creditOpen && lookupId && (
        <CreditModal
          network={network} driverId={lookupId} defaultCurrency={defaultCurrency}
          onClose={() => setCreditOpen(false)}
          onSaved={onSaved}
        />
      )}
    </div>
  );
}
