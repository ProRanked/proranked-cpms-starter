import { useState } from 'react';
import { useNetwork } from '../App';
import { api, ApiError, num, when } from '../api';
import type { Limits as LimitsT, LimitDimension, IncreaseRequest } from '../types';
import {
  Card, PageHeader, Spinner, ErrorBox, Empty, StatCard, KV, StatusPill,
  Btn, Modal, Input, Select, Textarea, Field, Notice, Table,
} from '../components/ui';
import { BarChart } from '../components/charts';
import { useResource } from '../hooks';

interface Usage {
  totalRequests?: number | null;
  totalUnits?: number | null;
  daily?: { date?: string | null; requests?: number | null }[] | null;
}

type Toast = { tone: 'ok' | 'bad'; msg: string };

const cap = (v?: number | null) => (v === null || v === undefined ? '∞' : num(v, 0));

function Meter({ title, dim }: { title: string; dim?: LimitDimension | null }) {
  if (!dim) return <Card title={title} className="p-5"><Empty msg="No data." /></Card>;
  const used = dim.currentUsage ?? 0;
  const eff = dim.effectiveLimit;
  const pct = eff && eff > 0 ? Math.min(100, Math.max(0, (used / eff) * 100)) : 0;
  return (
    <Card title={title}>
      <div className="px-5 pt-4 pb-5">
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-extrabold tracking-tight mono">{num(used, 0)}</span>
          <span className="text-[color:var(--color-ink-soft)] text-lg font-semibold mono">/ {cap(eff)}</span>
        </div>
        <div className="mt-3 h-2.5 w-full rounded-full bg-black/[0.06] overflow-hidden">
          <div
            className="h-full rounded-full bg-[color:var(--color-brand-500)] transition-all"
            style={{ width: `${eff && eff > 0 ? pct : 0}%` }}
          />
        </div>
        <p className="mt-1.5 text-xs text-[color:var(--color-ink-soft)]">
          {eff && eff > 0 ? `${num(pct, 0)}% of effective limit` : 'Unlimited'}
        </p>
        <div className="mt-4">
          <KV k="Tier limit" v={<span className="mono">{cap(dim.tierLimit)}</span>} />
          <KV k="Self limit" v={<span className="mono">{cap(dim.selfLimit)}</span>} />
          <KV k="Remaining" v={<span className="mono">{cap(dim.remaining)}</span>} />
        </div>
      </div>
    </Card>
  );
}

/** PUT /cpms/v1/limits — full replacement of operator self-imposed caps; empty field = null = unlimited (≤ tier). */
function EditCapsModal({ network, limits, onClose, onSaved }: {
  network: string; limits: LimitsT; onClose: () => void; onSaved: (t: Toast) => void;
}) {
  const [maxChargers, setMaxChargers] = useState(limits.chargers.selfLimit != null ? String(limits.chargers.selfLimit) : '');
  const [maxConnectors, setMaxConnectors] = useState(limits.connectors.selfLimit != null ? String(limits.connectors.selfLimit) : '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const parse = (s: string) => (s.trim() === '' ? null : Math.trunc(Number(s)));
  const chTier = limits.chargers.tierLimit;
  const coTier = limits.connectors.tierLimit;
  const chVal = parse(maxChargers);
  const coVal = parse(maxConnectors);
  const invalid =
    (maxChargers.trim() !== '' && (!Number.isFinite(chVal!) || chVal! < 0)) ||
    (maxConnectors.trim() !== '' && (!Number.isFinite(coVal!) || coVal! < 0)) ||
    (chVal != null && chTier != null && chVal > chTier) ||
    (coVal != null && coTier != null && coVal > coTier);

  const save = async () => {
    setBusy(true); setErr(null);
    try {
      await api.setLimits(network, { maxChargers: chVal, maxConnectors: coVal });
      onSaved({ tone: 'ok', msg: 'Self-imposed caps updated (full replacement applied).' });
      onClose();
    } catch (e) {
      const m = e instanceof ApiError
        ? `${e.message}${e.status === 403 ? ' — needs cpms:write / Admin role' : ''}`
        : String((e as Error)?.message ?? e);
      setErr(m);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Edit self-imposed caps" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-xs text-[color:var(--color-ink-soft)]">
          Sets a guard-rail below your tier ceiling so a leaked or looping key can't run up runaway bills.
          Effective limit = min(tier, self). Leave a field empty to clear it (unlimited up to tier).
        </p>
        <Field label="Max chargers">
          <Input type="number" min={0} step={1} value={maxChargers} placeholder="empty = unlimited"
            onChange={(e) => setMaxChargers(e.target.value)} />
          <span className="mt-1 block text-xs text-[color:var(--color-ink-soft)]">Tier ceiling: <span className="mono">{cap(chTier)}</span></span>
        </Field>
        <Field label="Max connectors">
          <Input type="number" min={0} step={1} value={maxConnectors} placeholder="empty = unlimited"
            onChange={(e) => setMaxConnectors(e.target.value)} />
          <span className="mt-1 block text-xs text-[color:var(--color-ink-soft)]">Tier ceiling: <span className="mono">{cap(coTier)}</span></span>
        </Field>
        {invalid && <Notice tone="bad">Each cap must be ≥ 0 and ≤ its tier ceiling. Use “Request increase” to raise the tier.</Notice>}
        {err && <Notice tone="bad">{err}</Notice>}
        <div className="flex justify-end gap-2 pt-1">
          <Btn variant="ghost" onClick={onClose} disabled={busy}>Cancel</Btn>
          <Btn variant="primary" onClick={save} loading={busy} disabled={invalid}>Save caps</Btn>
        </div>
      </div>
    </Modal>
  );
}

/** POST /cpms/v1/limits/increase-request — ask the platform to raise a tier ceiling. */
function RequestIncreaseModal({ network, limits, onClose, onSaved }: {
  network: string; limits: LimitsT; onClose: () => void; onSaved: (t: Toast) => void;
}) {
  const [resource, setResource] = useState<'chargers' | 'connectors'>('chargers');
  const [requestedLimit, setRequestedLimit] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const currentTier = resource === 'chargers' ? limits.chargers.tierLimit : limits.connectors.tierLimit;
  const reqVal = Math.trunc(Number(requestedLimit));
  const invalid = requestedLimit.trim() === '' || !Number.isFinite(reqVal) || reqVal <= 0;

  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      await api.requestIncrease(network, { resource, requestedLimit: reqVal, reason: reason.trim() || undefined });
      onSaved({ tone: 'ok', msg: 'Increase request submitted for review.' });
      onClose();
    } catch (e) {
      const m = e instanceof ApiError
        ? `${e.message}${e.status === 403 ? ' — needs cpms:write / Admin role' : ''}`
        : String((e as Error)?.message ?? e);
      setErr(m);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Request a tier increase" onClose={onClose}>
      <div className="space-y-4">
        <Field label="Resource">
          <Select value={resource} onChange={(v) => setResource(v as 'chargers' | 'connectors')} className="w-full">
            <option value="chargers">Chargers</option>
            <option value="connectors">Connectors</option>
          </Select>
          <span className="mt-1 block text-xs text-[color:var(--color-ink-soft)]">Current tier ceiling: <span className="mono">{cap(currentTier)}</span></span>
        </Field>
        <Field label="Requested limit">
          <Input type="number" min={1} step={1} value={requestedLimit} placeholder="e.g. 250"
            onChange={(e) => setRequestedLimit(e.target.value)} />
        </Field>
        <Field label="Reason">
          <Textarea rows={3} value={reason} placeholder="Why you need a higher ceiling (helps the reviewer)."
            onChange={(e) => setReason(e.target.value)} />
        </Field>
        {err && <Notice tone="bad">{err}</Notice>}
        <div className="flex justify-end gap-2 pt-1">
          <Btn variant="ghost" onClick={onClose} disabled={busy}>Cancel</Btn>
          <Btn variant="primary" onClick={submit} loading={busy} disabled={invalid}>Submit request</Btn>
        </div>
      </div>
    </Modal>
  );
}

export function Limits() {
  const network = useNetwork();
  const limits = useResource<LimitsT>(() => api.limits(network), [network], !!network);
  const usage = useResource<Usage>(() => api.usage(network, 30), [network], !!network);
  const requests = useResource(() => api.increaseRequests(network), [network], !!network);

  const [editOpen, setEditOpen] = useState(false);
  const [reqOpen, setReqOpen] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  if (!network) return <Empty msg="Select a network." />;

  const lim = limits.data;
  const dailyBars = Array.isArray(usage.data?.daily)
    ? usage.data!.daily!.map((d) => ({ x: String(d?.date ?? ''), y: Number(d?.requests ?? 0) }))
    : [];
  const reqRows = requests.data?.data ?? [];

  const handleSaved = (t: Toast, reload: () => void) => { setToast(t); reload(); };

  return (
    <div>
      <PageHeader
        title="Provisioning limits"
        sub="GET·PUT /cpms/v1/limits · POST /limits/increase-request · GET /limits/increase-requests"
        right={lim && (
          <>
            <Btn variant="ghost" onClick={() => setReqOpen(true)}>Request increase</Btn>
            <Btn variant="primary" onClick={() => setEditOpen(true)}>Edit caps</Btn>
          </>
        )}
      />

      {toast && <div className="mb-4"><Notice tone={toast.tone}>{toast.msg}</Notice></div>}

      {limits.loading ? (
        <Spinner />
      ) : limits.error ? (
        <ErrorBox error={limits.error} />
      ) : !lim ? (
        <Empty msg="No limits available for this network." />
      ) : (
        <div className="space-y-6">
          <Card title="Plan">
            <div className="px-5 py-4">
              <KV k="Plan code" v={<StatusPill value={lim.planCode || '—'} tone="info" />} />
            </div>
          </Card>

          <div className="grid gap-6 md:grid-cols-2">
            <Meter title="Chargers" dim={lim.chargers} />
            <Meter title="Connectors" dim={lim.connectors} />
          </div>

          <Card title="API usage (30d)">
            <div className="px-5 pt-5 pb-5 space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <StatCard label="Total requests" value={<span className="mono">{num(usage.data?.totalRequests ?? 0, 0)}</span>} accent />
                <StatCard label="Total units" value={<span className="mono">{num(usage.data?.totalUnits ?? 0, 0)}</span>} />
              </div>
              {dailyBars.length > 0 ? (
                <div>
                  <p className="text-[13px] font-semibold text-[color:var(--color-ink-soft)] mb-2">Daily requests</p>
                  <BarChart data={dailyBars} fmt={(v) => num(v, 0)} />
                </div>
              ) : (
                <Empty msg="No daily usage data." />
              )}
            </div>
          </Card>

          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-[color:var(--color-ink)]">Increase requests</h3>
              <Btn size="sm" variant="ghost" onClick={requests.reload} loading={requests.loading}>Refresh</Btn>
            </div>
            {requests.loading ? (
              <Spinner />
            ) : requests.error ? (
              <ErrorBox error={requests.error} />
            ) : reqRows.length === 0 ? (
              <Empty msg="No increase requests yet." />
            ) : (
              <Table
                columns={['Resource', 'Current tier', 'Requested', 'Status', 'Reason', 'Created', 'Reviewed']}
                numeric={[1, 2]}
                rows={reqRows.map((r: IncreaseRequest) => [
                  <span className="capitalize">{r.resource}</span>,
                  <span className="mono">{cap(r.currentTierLimit)}</span>,
                  <span className="mono">{num(r.requestedLimit, 0)}</span>,
                  <StatusPill value={r.status} />,
                  <span className="text-[color:var(--color-ink-soft)]">{r.reason || '—'}</span>,
                  when(r.createdAt),
                  r.reviewedAt ? <span title={r.reviewNote ?? ''}>{when(r.reviewedAt)}</span> : '—',
                ])}
              />
            )}
          </div>
        </div>
      )}

      {editOpen && lim && (
        <EditCapsModal
          network={network} limits={lim}
          onClose={() => setEditOpen(false)}
          onSaved={(t) => handleSaved(t, limits.reload)}
        />
      )}
      {reqOpen && lim && (
        <RequestIncreaseModal
          network={network} limits={lim}
          onClose={() => setReqOpen(false)}
          onSaved={(t) => handleSaved(t, requests.reload)}
        />
      )}
    </div>
  );
}
