import { useEffect, useRef, useState } from 'react';
import { useNetwork } from '../App';
import { api, ApiError, f, when } from '../api';
import type { Webhook, WebhookDelivery } from '../types';
import { PageHeader, Spinner, ErrorBox, Empty, Table, StatusPill, Btn, Modal, Input } from '../components/ui';

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

export function Webhooks() {
  const network = useNetwork();

  const [hooks, setHooks] = useState<Webhook[]>([]);
  const [eventTypes, setEventTypes] = useState<string[]>([]);
  const [err, setErr] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);

  // Per-row deliveries (expansion).
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const expandRef = useRef<string | null>(null);
  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([]);
  const [delLoading, setDelLoading] = useState(false);

  // Create modal.
  const [showCreate, setShowCreate] = useState(false);
  const [newUrl, setNewUrl] = useState('');
  const [newEvents, setNewEvents] = useState<string[]>([]);

  // Delete confirm.
  const [delTarget, setDelTarget] = useState<Webhook | null>(null);

  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!network) { setLoading(false); return; }
    let live = true;
    setLoading(true);
    setErr(null);
    setExpandedId(null);
    expandRef.current = null;
    (async () => {
      try {
        const [wh, et] = await Promise.all([
          api.webhooks(network),
          api.webhookEventTypes(network).catch(() => null), // may not exist → soft empty
        ]);
        if (!live) return;
        setHooks(wh.data ?? []);
        setEventTypes(normEventTypes(et));
      } catch (e) {
        if (live && e instanceof ApiError) setErr(e);
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => { live = false; };
  }, [network, reload]);

  async function toggleExpand(id: string) {
    if (expandRef.current === id) { expandRef.current = null; setExpandedId(null); return; }
    expandRef.current = id;
    setExpandedId(id);
    setDelLoading(true);
    setDeliveries([]);
    try {
      const r = await api.webhookDeliveries(network, id);
      if (expandRef.current === id) setDeliveries(r.data ?? []);
    } catch {
      if (expandRef.current === id) setDeliveries([]); // fail soft
    } finally {
      if (expandRef.current === id) setDelLoading(false);
    }
  }

  async function runTest(id: string) {
    setBusyId(id);
    setNotice(null);
    setActionErr(null);
    try {
      await api.testWebhook(network, id);
      setNotice('Test event dispatched.');
    } catch (e) {
      setActionErr(e instanceof ApiError ? e.message : 'Test failed.');
    } finally {
      setBusyId(null);
    }
  }

  async function confirmDelete() {
    if (!delTarget) return;
    setBusy(true);
    setActionErr(null);
    try {
      await api.deleteWebhook(network, delTarget.id);
      setDelTarget(null);
      if (expandRef.current === delTarget.id) { expandRef.current = null; setExpandedId(null); }
      setReload((x) => x + 1);
    } catch (e) {
      setActionErr(e instanceof ApiError ? e.message : 'Delete failed.');
    } finally {
      setBusy(false);
    }
  }

  function openCreate() {
    setNewUrl('');
    setNewEvents([]);
    setActionErr(null);
    setShowCreate(true);
  }

  function toggleNewEvent(t: string) {
    setNewEvents((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  }

  async function submitCreate(e: React.FormEvent) {
    e.preventDefault();
    const url = newUrl.trim();
    if (!url) { setActionErr('Endpoint URL is required.'); return; }
    setBusy(true);
    setActionErr(null);
    try {
      await api.createWebhook(network, { url, events: newEvents });
      setShowCreate(false);
      setReload((x) => x + 1);
    } catch (err2) {
      setActionErr(err2 instanceof ApiError ? err2.message : 'Create failed.');
    } finally {
      setBusy(false);
    }
  }

  const createBtn = (
    <Btn variant="primary" onClick={openCreate} disabled={!network}>Create webhook</Btn>
  );

  return (
    <>
      <PageHeader title="Webhooks" sub="GET /cpms/v1/webhooks · X-Network-Id = active network" right={createBtn} />

      {notice && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">{notice}</div>
      )}

      {!network ? (
        <Empty msg="Select a network to continue." />
      ) : loading ? (
        <Spinner label="Loading webhooks…" />
      ) : err ? (
        <ErrorBox error={err} />
      ) : hooks.length === 0 ? (
        <Empty msg="No webhooks configured for this network yet." />
      ) : (
        <div className="space-y-4">
          <Table
            columns={['Endpoint URL', 'Events', 'Status', 'Actions']}
            rows={hooks.map((w) => [
              <span className="mono break-all">{f(w, 'url', 'endpoint', 'target')}</span>,
              `${(w.events || []).length} events`,
              <StatusPill value={f(w, 'status', 'active')} />,
              <div className="flex items-center gap-2">
                <Btn onClick={() => toggleExpand(w.id)}>{expandedId === w.id ? 'Hide' : 'Deliveries'}</Btn>
                <Btn onClick={() => runTest(w.id)} disabled={busyId === w.id}>{busyId === w.id ? 'Testing…' : 'Test'}</Btn>
                <Btn variant="danger" onClick={() => { setActionErr(null); setDelTarget(w); }}>Delete</Btn>
              </div>,
            ])}
          />

          {expandedId && (
            <div>
              <p className="mb-2 px-1 text-sm font-semibold text-[color:var(--color-ink-soft)]">
                Recent deliveries · <span className="mono">GET /cpms/v1/webhooks/{expandedId}/deliveries</span>
              </p>
              {delLoading ? (
                <Spinner label="Loading deliveries…" />
              ) : deliveries.length === 0 ? (
                <Empty msg="No deliveries recorded for this webhook." />
              ) : (
                <Table
                  dense
                  numeric={[2]}
                  columns={['Event', 'Status', 'Code', 'When']}
                  rows={deliveries.map((d) => [
                    <span className="mono">{f(d, 'event', 'eventType', 'type')}</span>,
                    <StatusPill value={f(d, 'status', 'result')} />,
                    f(d, 'statusCode', 'code', 'responseCode', 'httpStatus'),
                    when(pick(d, 'attemptedAt', 'deliveredAt', 'sentAt', 'createdAt')),
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
              {eventTypes.length === 0 ? (
                <p className="text-sm text-[color:var(--color-ink-soft)]">No event types available — the webhook will subscribe to all events.</p>
              ) : (
                <div className="max-h-56 space-y-1 overflow-y-auto scroll-thin rounded-lg border border-black/10 p-2">
                  {eventTypes.map((t) => (
                    <label key={t} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-black/[0.03]">
                      <input
                        type="checkbox"
                        checked={newEvents.includes(t)}
                        onChange={() => toggleNewEvent(t)}
                      />
                      <span className="mono">{t}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {actionErr && <p className="text-sm font-medium text-red-700">{actionErr}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <Btn variant="ghost" onClick={() => setShowCreate(false)}>Cancel</Btn>
              <Btn variant="primary" type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create webhook'}</Btn>
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
              <Btn variant="danger" onClick={confirmDelete} disabled={busy}>{busy ? 'Deleting…' : 'Delete'}</Btn>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
