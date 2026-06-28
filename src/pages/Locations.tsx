import { useMemo, useState } from 'react';
import { useNetwork } from '../App';
import { api, ApiError, f, num } from '../api';
import { useResource } from '../hooks';
import {
  PageHeader, Spinner, ErrorBox, Empty, Table, Btn, Modal, Input, Select, Field, KV, Notice, StatusPill,
} from '../components/ui';

type Tone = 'ok' | 'bad';
type Msg = { tone: Tone; msg: string } | null;

// Locations write/delete + load-balancing edits need cpms:write:locations / cpms:command — often off for
// non-Admin operators. Surface 403/409 codes in a Notice rather than crashing.
function apiErr(e: unknown, extra = ''): string {
  if (e instanceof ApiError) {
    const hint = e.status === 403 ? ' — needs cpms:write:locations (may be off by default)' : '';
    return `${e.code}: ${e.message}${hint}${extra}`;
  }
  return String((e as Error)?.message ?? e);
}

function strategyOptions(current?: string): string[] {
  const base = ['equal', 'priority', 'fifo', 'round_robin'];
  return current && !base.includes(current) ? [current, ...base] : base;
}

export function Locations() {
  const network = useNetwork();
  const locs = useResource(() => api.locations(network), [network], !!network);

  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const rows = locs.data?.data ?? [];
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((l) =>
      (l.name ?? '').toLowerCase().includes(needle) ||
      (l.city ?? '').toLowerCase().includes(needle) ||
      (l.address ?? '').toLowerCase().includes(needle));
  }, [rows, q]);

  if (!network) return <Empty msg="Select a network." />;

  return (
    <div>
      <PageHeader
        title="Locations"
        sub="GET/POST/PUT/DELETE /cpms/v1/locations · /cpms/v1/load-balancing"
        right={
          <>
            <Input placeholder="Search name, city, address…" value={q} onChange={(e) => setQ(e.target.value)} className="w-60" />
            <Btn variant="primary" onClick={() => setAdding(true)}>Add location</Btn>
          </>
        }
      />

      {locs.loading ? (
        <Spinner label="Loading locations…" />
      ) : locs.error ? (
        <ErrorBox error={locs.error} />
      ) : filtered.length === 0 ? (
        <Empty msg={q ? 'No locations match your search.' : 'No locations found for this network.'} />
      ) : (
        <Table
          columns={['Name', 'City / State', 'Address', 'Country', 'Network', '']}
          rows={filtered.map((l) => [
            l.name || '—',
            [l.city, l.state].filter(Boolean).join(', ') || '—',
            l.address || '—',
            l.country || '—',
            <span className="mono">{l.networkId}</span>,
            <Btn variant="ghost" size="sm" onClick={() => setOpenId(l.id)}>View</Btn>,
          ])}
        />
      )}

      {adding && (
        <AddLocationModal
          network={network}
          onClose={() => setAdding(false)}
          onCreated={() => { setAdding(false); locs.reload(); }}
        />
      )}

      {openId && (
        <LocationDetailModal
          network={network}
          id={openId}
          onClose={() => setOpenId(null)}
          onChanged={locs.reload}
        />
      )}
    </div>
  );
}

function AddLocationModal({ network, onClose, onCreated }: { network: string; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ name: '', address: '', city: '', state: '', country: '', postalCode: '', latitude: '', longitude: '', timezone: '' });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((s) => ({ ...s, [k]: e.target.value }));
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Msg>(null);

  const submit = async () => {
    setBusy(true); setNotice(null);
    try {
      const body: Record<string, unknown> = {
        name: form.name.trim(), address: form.address.trim(), city: form.city.trim(), state: form.state.trim(),
        country: form.country.trim(), postalCode: form.postalCode.trim(), timezone: form.timezone.trim() || undefined,
      };
      if (form.latitude.trim()) body.latitude = Number(form.latitude);
      if (form.longitude.trim()) body.longitude = Number(form.longitude);
      await api.createLocation(network, body);
      onCreated();
    } catch (e) {
      setNotice({ tone: 'bad', msg: apiErr(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Add location" onClose={onClose}>
      <div className="space-y-3 max-h-[72vh] overflow-y-auto scroll-thin">
        {notice && <Notice tone={notice.tone}>{notice.msg}</Notice>}
        <Field label="Name"><Input value={form.name} onChange={set('name')} placeholder="Plaza Las Américas" /></Field>
        <Field label="Address"><Input value={form.address} onChange={set('address')} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="City"><Input value={form.city} onChange={set('city')} /></Field>
          <Field label="State"><Input value={form.state} onChange={set('state')} /></Field>
          <Field label="Country"><Input value={form.country} onChange={set('country')} placeholder="US" /></Field>
          <Field label="Postal code"><Input value={form.postalCode} onChange={set('postalCode')} /></Field>
          <Field label="Latitude"><Input value={form.latitude} onChange={set('latitude')} inputMode="decimal" placeholder="18.42" /></Field>
          <Field label="Longitude"><Input value={form.longitude} onChange={set('longitude')} inputMode="decimal" placeholder="-66.07" /></Field>
        </div>
        <Field label="Timezone"><Input value={form.timezone} onChange={set('timezone')} placeholder="America/Puerto_Rico" /></Field>
        <div className="flex justify-end gap-2 pt-1">
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" loading={busy} disabled={!form.name.trim()} onClick={submit}>Create location</Btn>
        </div>
      </div>
    </Modal>
  );
}

function LocationDetailModal({ network, id, onClose, onChanged }: { network: string; id: string; onClose: () => void; onChanged: () => void }) {
  const detail = useResource(() => api.location(network, id), [network, id], !!network);

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const setF = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((s) => ({ ...s, [k]: e.target.value }));
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Msg>(null);

  const [confirmDel, setConfirmDel] = useState(false);
  const [delBusy, setDelBusy] = useState(false);
  const [delNotice, setDelNotice] = useState<Msg>(null);

  const startEdit = () => {
    const d = detail.data;
    if (!d) return;
    const r = d as unknown as Record<string, unknown>;
    setForm({
      name: d.name ?? '', address: d.address ?? '', city: d.city ?? '', state: d.state ?? '',
      country: d.country ?? '', postalCode: d.postalCode ?? '',
      latitude: r.latitude != null ? String(r.latitude) : '',
      longitude: r.longitude != null ? String(r.longitude) : '',
      timezone: r.timezone != null ? String(r.timezone) : '',
    });
    setNotice(null);
    setEditing(true);
  };

  const save = async () => {
    setBusy(true); setNotice(null);
    try {
      const body: Record<string, unknown> = {
        name: form.name.trim(), address: form.address.trim(), city: form.city.trim(), state: form.state.trim(),
        country: form.country.trim(), postalCode: form.postalCode.trim(), timezone: form.timezone.trim() || undefined,
      };
      if (form.latitude.trim()) body.latitude = Number(form.latitude);
      if (form.longitude.trim()) body.longitude = Number(form.longitude);
      await api.updateLocation(network, id, body);
      setNotice({ tone: 'ok', msg: 'Location updated.' });
      setEditing(false);
      detail.reload();
      onChanged();
    } catch (e) {
      setNotice({ tone: 'bad', msg: apiErr(e) });
    } finally {
      setBusy(false);
    }
  };

  const doDelete = async () => {
    setDelBusy(true); setDelNotice(null);
    try {
      await api.deleteLocation(network, id);
      onChanged();
      onClose();
    } catch (e) {
      const extra = e instanceof ApiError && e.status === 409 ? ' — detach chargers / end active sessions first' : '';
      setDelNotice({ tone: 'bad', msg: apiErr(e, extra) });
    } finally {
      setDelBusy(false);
    }
  };

  const d = detail.data;
  const r = (d as unknown as Record<string, unknown>) ?? {};

  return (
    <Modal title="Location" onClose={onClose}>
      <div className="space-y-4 max-h-[72vh] overflow-y-auto scroll-thin">
        {notice && <Notice tone={notice.tone}>{notice.msg}</Notice>}

        {detail.loading ? (
          <Spinner label="Loading location…" />
        ) : detail.error ? (
          <ErrorBox error={detail.error} />
        ) : !d ? (
          <Empty msg="Location details unavailable." />
        ) : editing ? (
          <div className="space-y-3">
            <Field label="Name"><Input value={form.name} onChange={setF('name')} /></Field>
            <Field label="Address"><Input value={form.address} onChange={setF('address')} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="City"><Input value={form.city} onChange={setF('city')} /></Field>
              <Field label="State"><Input value={form.state} onChange={setF('state')} /></Field>
              <Field label="Country"><Input value={form.country} onChange={setF('country')} /></Field>
              <Field label="Postal code"><Input value={form.postalCode} onChange={setF('postalCode')} /></Field>
              <Field label="Latitude"><Input value={form.latitude} onChange={setF('latitude')} inputMode="decimal" /></Field>
              <Field label="Longitude"><Input value={form.longitude} onChange={setF('longitude')} inputMode="decimal" /></Field>
            </div>
            <Field label="Timezone"><Input value={form.timezone} onChange={setF('timezone')} /></Field>
            <div className="flex justify-end gap-2 pt-1">
              <Btn onClick={() => setEditing(false)}>Cancel</Btn>
              <Btn variant="primary" loading={busy} disabled={!form.name.trim()} onClick={save}>Save changes</Btn>
            </div>
          </div>
        ) : (
          <div>
            <KV k="ID" v={d.id} mono />
            <KV k="Name" v={d.name || '—'} />
            <KV k="Address" v={d.address || '—'} />
            <KV k="City" v={d.city || '—'} />
            <KV k="State" v={d.state || '—'} />
            <KV k="Country" v={d.country || '—'} />
            <KV k="Postal code" v={d.postalCode || '—'} mono />
            <KV k="Latitude" v={f(r, 'latitude')} mono />
            <KV k="Longitude" v={f(r, 'longitude')} mono />
            <KV k="Timezone" v={f(r, 'timezone')} mono />
            <KV k="Network" v={d.networkId} mono />
            <div className="flex justify-end gap-2 pt-3">
              <Btn variant="danger" onClick={() => setConfirmDel(true)}>Delete</Btn>
              <Btn variant="primary" onClick={startEdit}>Edit</Btn>
            </div>
          </div>
        )}

        {d && !editing && <LoadBalancingBlock network={network} id={id} />}
      </div>

      {confirmDel && (
        <Modal title="Delete location" onClose={() => setConfirmDel(false)}>
          <div className="space-y-3">
            {delNotice && <Notice tone={delNotice.tone}>{delNotice.msg}</Notice>}
            <p className="text-sm">
              Delete <span className="mono">{d?.name || id}</span>? This cannot be undone. Chargers must be
              detached and active sessions ended first (the server returns 409 otherwise).
            </p>
            <div className="flex justify-end gap-2">
              <Btn onClick={() => setConfirmDel(false)}>Cancel</Btn>
              <Btn variant="danger" loading={delBusy} onClick={doDelete}>Delete location</Btn>
            </div>
          </div>
        </Modal>
      )}
    </Modal>
  );
}

function LoadBalancingBlock({ network, id }: { network: string; id: string }) {
  const lb = useResource(() => api.loadBalancing(network, id), [network, id], !!network);

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ enabled: 'false', strategy: 'equal', siteMaxPowerKw: '', safetyMarginPct: '' });
  const [busy, setBusy] = useState(false);
  const [rbBusy, setRbBusy] = useState(false);
  const [notice, setNotice] = useState<Msg>(null);

  const is404 = lb.error?.status === 404;
  const d = lb.data;

  const startEdit = () => {
    setForm({
      enabled: d?.enabled ? 'true' : 'false',
      strategy: d?.strategy ?? 'equal',
      siteMaxPowerKw: d?.siteMaxPowerKw != null ? String(d.siteMaxPowerKw) : '',
      safetyMarginPct: d?.safetyMarginPct != null ? String(d.safetyMarginPct) : '',
    });
    setNotice(null);
    setEditing(true);
  };

  const save = async () => {
    setBusy(true); setNotice(null);
    try {
      await api.updateLoadBalancing(network, id, {
        enabled: form.enabled === 'true',
        strategy: form.strategy,
        siteMaxPowerKw: form.siteMaxPowerKw.trim() ? Number(form.siteMaxPowerKw) : undefined,
        safetyMarginPct: form.safetyMarginPct.trim() ? Number(form.safetyMarginPct) : undefined,
      });
      setNotice({ tone: 'ok', msg: 'Load balancing saved.' });
      setEditing(false);
      lb.reload();
    } catch (e) {
      setNotice({ tone: 'bad', msg: apiErr(e) });
    } finally {
      setBusy(false);
    }
  };

  const rebalance = async () => {
    setRbBusy(true); setNotice(null);
    try {
      await api.rebalance(network, id);
      setNotice({ tone: 'ok', msg: 'Rebalance triggered.' });
      lb.reload();
    } catch (e) {
      setNotice({ tone: 'bad', msg: apiErr(e) });
    } finally {
      setRbBusy(false);
    }
  };

  const kw = (v?: number | null) => (v != null ? `${num(v)} kW` : '—');
  const pct = (v?: number | null) => (v != null ? `${num(v)} %` : '—');

  return (
    <div className="rounded-xl border border-black/5 bg-black/[0.015] p-4">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <h4 className="text-sm font-semibold">Load balancing</h4>
          <p className="text-xs text-[color:var(--color-ink-soft)] mono">GET/PUT/POST /cpms/v1/load-balancing/:id</p>
        </div>
        {!editing && !lb.loading && (
          <div className="flex gap-2">
            <Btn size="sm" onClick={startEdit}>{is404 || !d ? 'Configure' : 'Edit'}</Btn>
            {d && !is404 && <Btn size="sm" variant="primary" loading={rbBusy} onClick={rebalance}>Rebalance</Btn>}
          </div>
        )}
      </div>

      {notice && <div className="mb-2"><Notice tone={notice.tone}>{notice.msg}</Notice></div>}

      {lb.loading ? (
        <Spinner label="Loading load balancing…" />
      ) : editing ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Enabled">
              <Select value={form.enabled} onChange={(v) => setForm((s) => ({ ...s, enabled: v }))} className="w-full">
                <option value="true">Enabled</option>
                <option value="false">Disabled</option>
              </Select>
            </Field>
            <Field label="Strategy">
              <Select value={form.strategy} onChange={(v) => setForm((s) => ({ ...s, strategy: v }))} className="w-full">
                {strategyOptions(form.strategy).map((o) => <option key={o} value={o}>{o}</option>)}
              </Select>
            </Field>
            <Field label="Site max power (kW)"><Input value={form.siteMaxPowerKw} onChange={(e) => setForm((s) => ({ ...s, siteMaxPowerKw: e.target.value }))} inputMode="decimal" /></Field>
            <Field label="Safety margin (%)"><Input value={form.safetyMarginPct} onChange={(e) => setForm((s) => ({ ...s, safetyMarginPct: e.target.value }))} inputMode="decimal" /></Field>
          </div>
          <div className="flex justify-end gap-2">
            <Btn size="sm" onClick={() => setEditing(false)}>Cancel</Btn>
            <Btn size="sm" variant="primary" loading={busy} onClick={save}>Save</Btn>
          </div>
        </div>
      ) : lb.error && !is404 ? (
        <ErrorBox error={lb.error} />
      ) : is404 || !d ? (
        <Empty msg="No load balancing configured for this location." />
      ) : (
        <div>
          <KV k="Enabled" v={<StatusPill value={d.enabled ? 'enabled' : 'disabled'} />} />
          <KV k="Strategy" v={d.strategy || '—'} />
          <KV k="Site max power" v={kw(d.siteMaxPowerKw)} mono />
          <KV k="Safety margin" v={pct(d.safetyMarginPct)} mono />
          <KV k="Current draw" v={kw(d.currentDrawKw)} mono />
          <KV k="Allocated" v={kw(d.allocatedKw)} mono />
        </div>
      )}
    </div>
  );
}
