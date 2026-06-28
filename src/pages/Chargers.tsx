import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useNetwork } from '../App';
import { api, ApiError, f } from '../api';
import { useResource } from '../hooks';
import {
  PageHeader, Spinner, ErrorBox, Empty, Table, StatusPill,
  Btn, Modal, Field, Input, Select, Notice,
} from '../components/ui';

const ALL = 'All';

export function Chargers() {
  const network = useNetwork();
  const chargers = useResource(() => api.chargers(network), [network], !!network);
  const list = chargers.data?.data ?? [];

  const [q, setQ] = useState('');
  const [status, setStatus] = useState<string>(ALL);
  const [showAdd, setShowAdd] = useState(false);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  // Distinct statuses with counts, computed over the full unfiltered set.
  const statusCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of list) {
      const s = c.status || 'unknown';
      m.set(s, (m.get(s) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [list]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return list.filter((c) => {
      if (status !== ALL && (c.status || 'unknown') !== status) return false;
      if (!needle) return true;
      return [c.uid, c.serialNumber, c.id]
        .some((v) => (v ?? '').toString().toLowerCase().includes(needle));
    });
  }, [list, q, status]);

  if (!network) {
    return (
      <>
        <PageHeader title="Chargers" sub="GET /cpms/v1/chargers · X-Network-Id" />
        <Empty msg="Select a network." />
      </>
    );
  }

  const addBtn = <Btn variant="primary" onClick={() => { setOkMsg(null); setShowAdd(true); }}>Add charger</Btn>;

  const chip = (label: string, count: number, active: boolean) => (
    <button
      key={label}
      onClick={() => setStatus(label)}
      className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
        active
          ? 'bg-[color:var(--color-brand-500)] text-white'
          : 'border border-black/10 text-[color:var(--color-ink-soft)] hover:bg-black/[0.03]'
      }`}
    >
      {label} <span className="opacity-70">{count}</span>
    </button>
  );

  return (
    <>
      <PageHeader
        title="Chargers"
        sub="GET /cpms/v1/chargers · POST /cpms/v1/chargers"
        right={
          <div className="flex items-center gap-2">
            <span className="text-sm text-[color:var(--color-ink-soft)]">{list.length} total</span>
            {addBtn}
          </div>
        }
      />

      {okMsg && <div className="mb-4"><Notice tone="ok">{okMsg}</Notice></div>}

      {chargers.loading ? (
        <Spinner />
      ) : chargers.error ? (
        <ErrorBox error={chargers.error} />
      ) : list.length === 0 ? (
        <Empty msg="No chargers in this network yet." />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search uid, serial, or id…"
              className="w-64 max-w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
            />
            <div className="flex flex-wrap items-center gap-2">
              {chip(ALL, list.length, status === ALL)}
              {statusCounts.map(([s, n]) => chip(s, n, status === s))}
            </div>
          </div>

          {filtered.length === 0 ? (
            <Empty msg="No chargers match your filters." />
          ) : (
            <Table
              columns={['Charger', 'Status', 'OCPP', 'Location', 'Firmware', 'Serial']}
              rows={filtered.map((c) => {
                const r = c as unknown as Record<string, unknown>;
                return [
                  <Link to={'/chargers/' + c.id} className="mono text-[color:var(--color-brand-600)] hover:underline">
                    {f(r, 'uid')}
                  </Link>,
                  <StatusPill value={c.status} />,
                  f(r, 'ocppVersion'),
                  f(r, 'locationName'),
                  f(r, 'firmwareVersion'),
                  <span className="mono">{f(r, 'serialNumber')}</span>,
                ];
              })}
            />
          )}
        </>
      )}

      {showAdd && (
        <AddChargerModal
          network={network}
          onClose={() => setShowAdd(false)}
          onCreated={(msg) => { setOkMsg(msg); setShowAdd(false); chargers.reload(); }}
        />
      )}
    </>
  );
}

function AddChargerModal({ network, onClose, onCreated }: {
  network: string;
  onClose: () => void;
  onCreated: (msg: string) => void;
}) {
  const models = useResource(() => api.chargerModels(network), [network], !!network);
  const locations = useResource(() => api.locations(network), [network], !!network);

  const [serialNumber, setSerialNumber] = useState('');
  const [modelUuid, setModelUuid] = useState('');
  const [locationUuid, setLocationUuid] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const modelList = models.data?.data ?? [];
  const locationList = locations.data?.data ?? [];
  const canSubmit = serialNumber.trim() !== '' && modelUuid !== '' && !busy;

  const submit = async () => {
    setErr(null);
    setBusy(true);
    try {
      await api.createCharger(network, {
        serialNumber: serialNumber.trim(),
        modelUuid,
        locationUuid: locationUuid || undefined,
      });
      onCreated(`Charger ${serialNumber.trim()} created.`);
    } catch (e) {
      if (e instanceof ApiError) {
        setErr(e.status === 403
          ? `${e.message} — needs cpms:write:chargers (may be off by default).`
          : `${e.code} (${e.status}): ${e.message}`);
      } else {
        setErr(String(e));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Add charger" onClose={onClose}>
      <div className="space-y-4">
        {err && <Notice tone="bad">{err}</Notice>}

        <Field label="Serial number">
          <Input
            value={serialNumber}
            onChange={(e) => setSerialNumber(e.target.value)}
            placeholder="e.g. SN-00123-AB"
            className="mono"
          />
        </Field>

        <Field label="Model">
          {models.loading ? (
            <Spinner />
          ) : models.error ? (
            <Notice tone="bad">{models.error.message}</Notice>
          ) : (
            <Select value={modelUuid} onChange={setModelUuid} className="w-full">
              <option value="">Select a model…</option>
              {modelList.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}{m.manufacturerName ? ` · ${m.manufacturerName}` : ''}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field label="Location (optional)">
          {locations.loading ? (
            <Spinner />
          ) : locations.error ? (
            <Notice tone="bad">{locations.error.message}</Notice>
          ) : (
            <Select value={locationUuid} onChange={setLocationUuid} className="w-full">
              <option value="">Unassigned</option>
              {locationList.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </Select>
          )}
        </Field>

        <div className="flex justify-end gap-2 pt-1">
          <Btn onClick={onClose} disabled={busy}>Cancel</Btn>
          <Btn variant="primary" onClick={submit} loading={busy} disabled={!canSubmit}>Create charger</Btn>
        </div>
      </div>
    </Modal>
  );
}
