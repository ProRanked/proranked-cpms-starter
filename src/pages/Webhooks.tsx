import { useState } from 'react';
import { useNetwork } from '../App';
import { api, ApiError, f, when } from '../api';
import type { Webhook, WebhookDelivery } from '../types';
import { useResource } from '../hooks';
import { PageHeader, Spinner, ErrorBox, Empty, Table, StatusPill, Btn, Modal, Input, Notice } from '../components/ui';

// First non-empty string value across keys (raw, for date inputs to when()).
const pick = (o: Record<string, unknown>, ...keys: string[]): string | undefined => {
  for (const k of keys) { const v = o[k]; if (typeof v === 'string' && v) return v; }
  return undefined;
};

// Normalize the loosely-typed /webhooks/event-types payload into a flat string[].
function normEventTypes(raw: unknown): string[] {
  const arr: unknown[] = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { data?: unknown[] })?.data)
      ? (raw as { data: unknown[] }).data
      : Array.isArray((raw as { eventTypes?: unknown[] })?.eventTypes)
        ? (raw as { eventTypes: unknown[] }).eventTypes
        : [];
  const out: string[] = [];
  for (const e of arr) {
    const s = typeof e === 'string' ? e : f(e as Record<string, unknown>, 'type', 'name', 'event', 'id');
    if (s && s !== '—' && !out.includes(s)) out.push(s);
  }
  return out;
}

const urlOf = (w: Webhook): string => String((w.url ?? (w as Record<string, unknown>).endpoint ?? (w as Record<string, unknown>).target ?? '') as string);

function isHookActive(w: Webhook): boolean {
  if (typeof w.active === 'boolean') return w.active;
  const s = String(w.status ?? '').toLowerCase();
  if (s) return /(active|enabled|on|true)/.test(s) && !/(disabled|inactive|paused|off)/.test(s);
  return true;
}

function eventsLabel(w: Webhook): string {
  const ev = Array.isArray(w.events) ? w.events : [];
  if (ev.length === 0 || ev.includes('*')) return 'all events';
  return `${ev.length} event${ev.length === 1 ? '' : 's'}`;
}

function isFailedDelivery(d: WebhookDelivery): boolean {
  const s = String(f(d, 'status', 'result')).toLowerCase();
  if (/(fail|error|reject|timeout|bad|dead)/.test(s)) return true;
  if (/(ok|success|delivered|sent|200|accepted|complete)/.test(s)) return false;
  const code = Number(f(d, 'statusCode', 'code', 'responseCode', 'httpStatus'));
  return Number.isFinite(code) && code >= 400;
}

const scopeHint = (e: ApiError): string => (e.status === 403 ? ' — needs cpms:write:webhooks / off by default' : '');

export function Webhooks() {
  const network = useNetwork();

  const hooksRes = useResource(() => api.webhooks(network), [network], !!network);
  const etRes = useResource(() => api.webhookEventTypes(network).catch(() => null), [network], !!network);
  const hooks = hooksRes.data?.data ?? [];
  const eventTypes = normEventTypes(etRes.data);

  // Per-row deliveries (expansion) — fetched reactively when expandedId changes.
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const delRes = useResource(
    () => api.webhookDeliveries(network, expandedId!),
    [network, expandedId],
    !!network && !!expandedId,
  );
  const deliveries = delRes.data?.data ?? [];

  // Create modal.
  const [showCreate, setShowCreate] = useState(false);
  const [newUrl, setNewUrl] = useState('');
  const [newEvents, setNewEvents] = useState<string[]>([]);

  // Edit modal.
  const [editTarget, setEditTarget] = useState<Webhook | null>(null);
  const [editUrl, setEditUrl] = useState('');
  const [editEvents, setEditEvents] = useState<string[]>([]);
  const [editActive, setEditActive] = useState(true);

  // Delete confirm.
  const [delTarget, setDelTarget] = useState<Webhook | null>(null);

  // One-time signing secret returned on create.
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [busy, setBusy] = useState(false);              // modal submit (create/edit/delete)
  const [busyId, setBusyId] = useState<string | null>(null);   // per-row test
  const [retryId, setRetryId] = useState<string | null>(null); // per-delivery retry
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'bad'; msg: string } | null>(null);

  function toggleExpand(id: string) {
    setExpandedId((cur) => (cur === id ? null : id));
  }

  function openCreate() {
    setNewUrl('');
    setNewEvents([]);
    setActionErr(null);
    setShowCreate(true);
  }
  const toggleNewEvent = (t: string) => setNewEvents((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t]));

  async function submitCreate(e: React.FormEvent) {
    e.preventDefault();
    const url = newUrl.trim();
    if (!url) { setActionErr('Endpoint URL is required.'); return; }
    setBusy(true);
    setActionErr(null);
    try {
      // FIX: the API expects `events` as a comma-joined string (or '*' for all), NOT an array.
      const res = await api.createWebhook(network, { url, events: newEvents.join(',') || '*' });
      const secret = (res?.hmacSecret ?? res?.secret ?? res?.signingSecret) as string | undefined;
      setShowCreate(false);
      setCreatedSecret(secret ?? null);
      setNotice(secret ? null : { tone: 'ok', msg: 'Webhook created.' });
      hooksRes.reload();
    } catch (err2) {
      setActionErr(err2 instanceof ApiError ? `${err2.message}${scopeHint(err2)}` : 'Create failed.');
    } finally {
      setBusy(false);
    }
  }

  function openEdit(w: Webhook) {
    setEditTarget(w);
    setEditUrl(urlOf(w));
    setEditEvents(Array.isArray(w.events) ? w.events.filter((x) => x !== '*') : []);
    setEditActive(isHookActive(w));
    setActionErr(null);
  }
  const toggleEditEvent = (t: string) => setEditEvents((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t]));

  async function submitEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editTarget) return;
    const url = editUrl.trim();
    if (!url) { setActionErr('Endpoint URL is required.'); return; }
    setBusy(true);
    setActionErr(null);
    try {
      // isActive=true re-enables a disabled hook; events comma-joined ('*' for all).
      await api.updateWebhook(network, editTarget.id, { url, events: editEvents.join(',') || '*', isActive: editActive });
      setEditTarget(null);
      setNotice({ tone: 'ok', msg: 'Webhook updated.' });
      hooksRes.reload();
    } catch (err2) {
      setActionErr(err2 instanceof ApiError ? `${err2.message}${scopeHint(err2)}` : 'Update failed.');
    } finally {
      setBusy(false);
    }
  }

  async function runTest(id: string) {
    setBusyId(id);
    setNotice(null);
    try {
      await api.testWebhook(network, id);
      setNotice({ tone: 'ok', msg: 'Test event dispatched.' });
    } catch (e) {
      setNotice({ tone: 'bad', msg: e instanceof ApiError ? `Test failed: ${e.message}${scopeHint(e)}` : 'Test failed.' });
    } finally {
      setBusyId(null);
    }
  }

  async function retryDelivery(deliveryId: string) {
    if (!expandedId) return;
    setRetryId(deliveryId);
    setNotice(null);
    try {
      await api.retryDelivery(network, expandedId, deliveryId);
      setNotice({ tone: 'ok', msg: 'Delivery re-queued for retry.' });
      delRes.reload();
    } catch (e) {
      setNotice({ tone: 'bad', msg: e instanceof ApiError ? `Retry failed: ${e.message}${scopeHint(e)}` : 'Retry failed.' });
    } finally {
      setRetryId(null);
    }
  }

  async function confirmDelete() {
    if (!delTarget) return;
    setBusy(true);
    setActionErr(null);
    try {
      await api.deleteWebhook(network, delTarget.id);
      const wasExpanded = expandedId === delTarget.id;
      setDelTarget(null);
      if (wasExpanded) setExpandedId(null);
      setNotice({ tone: 'ok', msg: 'Webhook deleted.' });
      hooksRes.reload();
    } catch (e) {
      setActionErr(e instanceof ApiError ? `${e.message}${scopeHint(e)}` : 'Delete failed.');
    } finally {
      setBusy(false);
    }
  }

  function copySecret() {
    if (!createdSecret) return;
    navigator.clipboard?.writeText(createdSecret)
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })
      .catch(() => {});
  }

  const createBtn = <Btn variant="primary" onClick={openCreate} disabled={!network}>Create webhook</Btn>;

  // Reusable event-type checklist for both create + edit modals.
  const eventChecklist = (selected: string[], onToggle: (t: string) => void) => (
    eventTypes.length === 0
      ? <p className="text-sm text-[color:var(--color-ink-soft)]">No event types available — the webhook will subscribe to all events (<span className="mono">*</span>).</p>
      : (
        <div className="max-h-56 space-y-1 overflow-y-auto scroll-thin rounded-lg border border-black/10 p-2">
          {eventTypes.map((t) => (
            <label key={t} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-black/[0.03]">
              <input type="checkbox" checked={selected.includes(t)} onChange={() => onToggle(t)} />
              <span className="mono">{t}</span>
            </label>
          ))}
        </div>
      )
  );

  return (
    <>
      <PageHeader title="Webhooks" sub="GET·POST·PATCH·DELETE /cpms/v1/webhooks · X-Network-Id = active network" right={createBtn} />

      {createdSecret && (
        <div className="mb-4">
          <Notice tone="ok">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold">Signing secret — copy now, it is shown once.</p>
                <p className="mt-1 mono break-all">{createdSecret}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Btn size="sm" onClick={copySecret}>{copied ? 'Copied' : 'Copy'}</Btn>
                <Btn size="sm" onClick={() => setCreatedSecret(null)}>Dismiss</Btn>
              </div>
            </div>
          </Notice>
        </div>
      )}

      {notice && <div className="mb-4"><Notice tone={notice.tone}>{notice.msg}</Notice></div>}

      {!network ? (
        <Empty msg="Select a network to continue." />
      ) : hooksRes.loading ? (
        <Spinner label="Loading webhooks…" />
      ) : hooksRes.error ? (
        <ErrorBox error={hooksRes.error} />
      ) : hooks.length === 0 ? (
        <Empty msg="No webhooks configured for this network yet." />
      ) : (
        <div className="space-y-4">
          <Table
            columns={['Endpoint URL', 'Events', 'Status', 'Actions']}
            rows={hooks.map((w) => [
              <span className="mono break-all">{f(w, 'url', 'endpoint', 'target')}</span>,
              eventsLabel(w),
              <StatusPill value={f(w, 'status', 'active')} />,
              <div className="flex items-center gap-2">
                <Btn onClick={() => toggleExpand(w.id)}>{expandedId === w.id ? 'Hide' : 'Deliveries'}</Btn>
                <Btn onClick={() => openEdit(w)}>Edit</Btn>
                <Btn onClick={() => runTest(w.id)} loading={busyId === w.id}>Test</Btn>
                <Btn variant="danger" onClick={() => { setActionErr(null); setDelTarget(w); }}>Delete</Btn>
              </div>,
            ])}
          />

          {expandedId && (
            <div>
              <p className="mb-2 px-1 text-sm font-semibold text-[color:var(--color-ink-soft)]">
                Recent deliveries · <span className="mono">GET /cpms/v1/webhooks/{expandedId}/deliveries</span>
              </p>
              {delRes.loading ? (
                <Spinner label="Loading deliveries…" />
              ) : delRes.error ? (
                <ErrorBox error={delRes.error} />
              ) : deliveries.length === 0 ? (
                <Empty msg="No deliveries recorded for this webhook." />
              ) : (
                <Table
                  dense
                  numeric={[2]}
                  columns={['Event', 'Status', 'Code', 'When', '']}
                  rows={deliveries.map((d) => [
                    <span className="mono">{f(d, 'event', 'eventType', 'type')}</span>,
                    <StatusPill value={f(d, 'status', 'result')} />,
                    f(d, 'statusCode', 'code', 'responseCode', 'httpStatus'),
                    when(pick(d, 'attemptedAt', 'deliveredAt', 'sentAt', 'createdAt')),
                    isFailedDelivery(d)
                      ? <Btn size="sm" onClick={() => retryDelivery(d.id)} loading={retryId === d.id}>Retry</Btn>
                      : <span className="text-xs text-[color:var(--color-ink-soft)]">—</span>,
                  ])}
                />
              )}
            </div>
          )}
        </div>
      )}

      {showCreate && (
        <Modal title="Create webhook" onClose={() => setShowCreate(false)}>
          <form onSubmit={submitCreate} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-semibold text-[color:var(--color-ink)]">Endpoint URL</label>
              <Input
                type="url"
                placeholder="https://example.com/hooks/proranked"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                autoFocus
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-semibold text-[color:var(--color-ink)]">
                Event types {newEvents.length > 0 && <span className="text-[color:var(--color-ink-soft)]">({newEvents.length} selected)</span>}
              </label>
              {eventChecklist(newEvents, toggleNewEvent)}
              <p className="mt-1 text-xs text-[color:var(--color-ink-soft)]">Select none to subscribe to all events (<span className="mono">*</span>).</p>
            </div>

            {actionErr && <p className="text-sm font-medium text-red-700">{actionErr}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <Btn variant="ghost" onClick={() => setShowCreate(false)}>Cancel</Btn>
              <Btn variant="primary" type="submit" loading={busy}>Create webhook</Btn>
            </div>
          </form>
        </Modal>
      )}

      {editTarget && (
        <Modal title="Edit webhook" onClose={() => setEditTarget(null)}>
          <form onSubmit={submitEdit} className="space-y-4">
            <p className="text-xs text-[color:var(--color-ink-soft)]">
              <span className="mono break-all">PATCH /cpms/v1/webhooks/{editTarget.id}</span>
            </p>

            <div>
              <label className="mb-1 block text-sm font-semibold text-[color:var(--color-ink)]">Endpoint URL</label>
              <Input
                type="url"
                placeholder="https://example.com/hooks/proranked"
                value={editUrl}
                onChange={(e) => setEditUrl(e.target.value)}
                autoFocus
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-semibold text-[color:var(--color-ink)]">
                Event types {editEvents.length > 0 && <span className="text-[color:var(--color-ink-soft)]">({editEvents.length} selected)</span>}
              </label>
              {eventChecklist(editEvents, toggleEditEvent)}
              <p className="mt-1 text-xs text-[color:var(--color-ink-soft)]">Select none to subscribe to all events (<span className="mono">*</span>).</p>
            </div>

            <label className="flex cursor-pointer items-start gap-2 text-sm">
              <input type="checkbox" className="mt-0.5" checked={editActive} onChange={(e) => setEditActive(e.target.checked)} />
              <span>
                <span className="font-semibold text-[color:var(--color-ink)]">Active</span>
                <span className="block text-xs text-[color:var(--color-ink-soft)]">Uncheck to disable delivery; check to re-enable a disabled hook.</span>
              </span>
            </label>

            {actionErr && <p className="text-sm font-medium text-red-700">{actionErr}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <Btn variant="ghost" onClick={() => setEditTarget(null)}>Cancel</Btn>
              <Btn variant="primary" type="submit" loading={busy}>Save changes</Btn>
            </div>
          </form>
        </Modal>
      )}

      {delTarget && (
        <Modal title="Delete webhook" onClose={() => setDelTarget(null)}>
          <div className="space-y-4">
            <p className="text-sm">
              Permanently delete the webhook for <span className="mono break-all">{f(delTarget, 'url', 'endpoint', 'target')}</span>?
              This cannot be undone.
            </p>
            {actionErr && <p className="text-sm font-medium text-red-700">{actionErr}</p>}
            <div className="flex justify-end gap-2">
              <Btn variant="ghost" onClick={() => setDelTarget(null)}>Cancel</Btn>
              <Btn variant="danger" onClick={confirmDelete} loading={busy}>Delete</Btn>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
