import { useState } from 'react';
import { useNetwork } from '../App';
import { api, ApiError, money, when } from '../api';
import { useResource } from '../hooks';
import type { FraudHold } from '../types';
import { PageHeader, Spinner, ErrorBox, Empty, Table, StatusPill, Btn, Modal, Notice } from '../components/ui';

export function Holds() {
  const network = useNetwork();
  const holds = useResource(() => api.fraudHolds(network), [network], !!network);

  const [sel, setSel] = useState<FraudHold | null>(null);
  const [waive, setWaive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'bad'; msg: string } | null>(null);

  function open(h: FraudHold) {
    setSel(h);
    setWaive(false);
    setNotice(null);
  }

  async function release() {
    if (!sel) return;
    setBusy(true);
    setNotice(null);
    try {
      await api.clearHold(network, sel.driverId, { waive });
      const who = sel.email || sel.driverId;
      setNotice({ tone: 'ok', msg: `Hold released for ${who}${waive ? ' — balance waived' : ''}.` });
      setSel(null);
      setWaive(false);
      holds.reload();
    } catch (e) {
      const err = e as ApiError;
      const msg = err.status === 403
        ? `Denied — needs cpms:write:fraud (off by default for non-Admin): ${err.message}`
        : err.message;
      setNotice({ tone: 'bad', msg });
    } finally {
      setBusy(false);
    }
  }

  if (!network) return <Empty msg="Select a network." />;

  return (
    <div>
      <PageHeader
        title="Anti-Fraud Holds"
        sub="GET /cpms/v1/fraud/holds · POST .../clear-hold"
        right={<Btn size="sm" onClick={holds.reload}>Refresh</Btn>}
      />

      {notice && <div className="mb-4"><Notice tone={notice.tone}>{notice.msg}</Notice></div>}

      {holds.loading && <Spinner />}
      {holds.error && <ErrorBox error={holds.error} />}
      {!holds.loading && !holds.error && (
        (holds.data?.data.length ?? 0) === 0 ? (
          <Empty msg="No drivers on hold" />
        ) : (
          <Table
            columns={['Driver', 'Phone', 'Reason', 'Outstanding', 'Held', '']}
            numeric={[3]}
            rows={(holds.data?.data ?? []).map((h) => [
              <span className="mono">{h.email || h.driverId}</span>,
              h.phoneVerified
                ? <StatusPill value="Verified" tone="ok" />
                : <StatusPill value="Unverified" tone="bad" />,
              h.reason || '—',
              money(h.outstandingBalance),
              when(h.heldAt),
              <Btn size="sm" variant="danger" onClick={() => open(h)}>Release</Btn>,
            ])}
          />
        )
      )}

      {sel && (
        <Modal title="Release hold" onClose={() => { if (!busy) setSel(null); }}>
          <p className="text-sm text-[color:var(--color-ink-soft)]">
            Release the anti-fraud hold for{' '}
            <span className="mono">{sel.email || sel.driverId}</span>?
            {sel.reason && <> Reason on file: <span className="font-semibold">{sel.reason}</span>.</>}
          </p>

          <label className="mt-4 flex items-start gap-2.5 rounded-lg border border-black/10 px-3 py-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={waive}
              onChange={(e) => setWaive(e.target.checked)}
              className="mt-0.5 h-4 w-4"
            />
            <span className="text-sm">
              Also waive this operator's balance
              {sel.outstandingBalance !== undefined && sel.outstandingBalance !== null && (
                <span className="text-[color:var(--color-ink-soft)]"> ({money(sel.outstandingBalance)} outstanding)</span>
              )}
            </span>
          </label>

          <div className="mt-5 flex justify-end gap-2">
            <Btn onClick={() => setSel(null)} disabled={busy}>Cancel</Btn>
            <Btn variant="danger" loading={busy} onClick={release}>
              {waive ? 'Release & waive' : 'Release hold'}
            </Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}
