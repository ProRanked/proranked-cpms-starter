import { useEffect, useState, type ReactNode } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useNetwork } from '../App';
import { api, ApiError, f, num, when, ago } from '../api';
import { useResource } from '../hooks';
import type {
  ChargerDetail as ChargerDetailT, ConnectorSummary, ChargerCommand, ChargingProfile, DeviceModelVar, Certificate,
} from '../types';
import { Card, Spinner, ErrorBox, Empty, Table, StatusPill, Tabs, KV, Btn, Modal, Input, Select, Textarea, Field, Notice } from '../components/ui';

const TABS = ['Overview', 'Connectors', 'Configuration', 'Commands', 'Charging Profiles', 'Monitoring', 'Display', 'Device Model', 'Firmware', 'Certificates', 'Diagnostics'];

const PRE = 'mono text-xs whitespace-pre-wrap break-all bg-black/[0.03] rounded-lg p-3 overflow-x-auto';

const STANDARDS = ['IEC_62196_T2', 'IEC_62196_T2_COMBO', 'CHADEMO', 'IEC_62196_T1', 'IEC_62196_T1_COMBO', 'TESLA_S', 'TESLA_R', 'DOMESTIC_F', 'GBT_AC', 'GBT_DC'];
const FORMATS = ['SOCKET', 'CABLE'];
const POWER_TYPES = ['AC_1_PHASE', 'AC_3_PHASE', 'DC'];

// ───────────────────────── shared form/mutation plumbing ─────────────────────────

type FF = { name: string; label: string; kind?: 'number' | 'text' | 'textarea' | 'select'; options?: { value: string; label?: string }[]; optional?: boolean; placeholder?: string };

const opt = (arr: string[]) => arr.map((v) => ({ value: v }));
const withVal = (arr: string[], v?: string | null) => opt(v && !arr.includes(v) ? [v, ...arr] : arr);

/** Shared mutation runner: try/catch(ApiError) → tone'd Notice + busy flag + onOk hook. */
function useMutation() {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'bad'; msg: string } | null>(null);
  const run = async (fn: () => Promise<unknown>, okMsg: string, onOk?: () => void) => {
    setBusy(true); setNotice(null);
    try {
      await fn();
      setNotice({ tone: 'ok', msg: okMsg });
      onOk?.();
    } catch (e) {
      const m = e instanceof ApiError
        ? (e.status === 403 ? `${e.message} — needs a cpms:write / command scope (may be off by default)` : `${e.code} (${e.status}) · ${e.message}`)
        : 'Request failed.';
      setNotice({ tone: 'bad', msg: m });
    } finally {
      setBusy(false);
    }
  };
  return { busy, notice, run };
}

function buildPayload(fields: FF[], vals: Record<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const fl of fields) {
    const v = (vals[fl.name] ?? '').trim();
    if (v === '') continue; // omit empties → server keeps defaults
    out[fl.name] = fl.kind === 'number' ? Number(v) : v;
  }
  return out;
}

/** Generic field-driven mutation modal. Builds {field:value} payload (numbers coerced, empties dropped). */
function FormModal({ title, fields, initial, submitLabel, danger, okMsg, intro, transform, onSubmit, onSuccess, onClose }: {
  title: string; fields: FF[]; initial?: Record<string, string>; submitLabel?: string; danger?: boolean; okMsg?: string; intro?: ReactNode;
  transform?: (payload: Record<string, unknown>, vals: Record<string, string>) => Record<string, unknown>;
  onSubmit: (payload: Record<string, unknown>) => Promise<unknown>;
  onSuccess?: () => void; onClose: () => void;
}) {
  const [vals, setVals] = useState<Record<string, string>>(() => {
    const base: Record<string, string> = {};
    for (const fl of fields) base[fl.name] = initial?.[fl.name] ?? '';
    return base;
  });
  const { busy, notice, run } = useMutation();
  const set = (k: string, v: string) => setVals((s) => ({ ...s, [k]: v }));
  const submit = () => {
    const p0 = buildPayload(fields, vals);
    const payload = transform ? transform(p0, vals) : p0;
    run(() => onSubmit(payload), okMsg ?? 'Saved.', onSuccess);
  };
  return (
    <Modal title={title} onClose={() => { if (!busy) onClose(); }}>
      {intro && <div className="mb-3 text-sm text-[color:var(--color-ink-soft)]">{intro}</div>}
      <div className="space-y-3">
        {fields.map((fl) => (
          <Field key={fl.name} label={fl.label}>
            {fl.kind === 'select' ? (
              <Select value={vals[fl.name]} onChange={(v) => set(fl.name, v)} className="w-full">
                {fl.optional && <option value="">—</option>}
                {fl.options?.map((o) => <option key={o.value} value={o.value}>{o.label ?? o.value}</option>)}
              </Select>
            ) : fl.kind === 'textarea' ? (
              <Textarea value={vals[fl.name]} onChange={(e) => set(fl.name, e.target.value)} rows={3} placeholder={fl.placeholder} />
            ) : (
              <Input type={fl.kind === 'number' ? 'number' : 'text'} value={vals[fl.name]} onChange={(e) => set(fl.name, e.target.value)} placeholder={fl.placeholder} />
            )}
          </Field>
        ))}
      </div>
      {notice && <div className="mt-3"><Notice tone={notice.tone}>{notice.msg}</Notice></div>}
      <div className="mt-5 flex justify-end gap-2">
        <Btn variant="ghost" onClick={onClose} disabled={busy}>Close</Btn>
        <Btn variant={danger ? 'danger' : 'primary'} onClick={submit} loading={busy}>{submitLabel ?? 'Save'}</Btn>
      </div>
    </Modal>
  );
}

function ConfirmModal({ title, body, confirmLabel, danger, okMsg, onConfirm, onSuccess, onClose }: {
  title: string; body: ReactNode; confirmLabel?: string; danger?: boolean; okMsg?: string;
  onConfirm: () => Promise<unknown>; onSuccess?: () => void; onClose: () => void;
}) {
  const { busy, notice, run } = useMutation();
  return (
    <Modal title={title} onClose={() => { if (!busy) onClose(); }}>
      <div className="text-sm">{body}</div>
      {notice && <div className="mt-3"><Notice tone={notice.tone}>{notice.msg}</Notice></div>}
      <div className="mt-5 flex justify-end gap-2">
        <Btn variant="ghost" onClick={onClose} disabled={busy}>Cancel</Btn>
        <Btn variant={danger ? 'danger' : 'primary'} loading={busy} onClick={() => run(onConfirm, okMsg ?? 'Done.', onSuccess)}>{confirmLabel ?? 'Confirm'}</Btn>
      </div>
    </Modal>
  );
}

/** Single fire-and-forget button with inline result (no modal) — used for benign OCPP triggers. */
function InlineAction({ label, run: fn, okMsg, after }: { label: string; run: () => Promise<unknown>; okMsg: string; after?: () => void }) {
  const { busy, notice, run } = useMutation();
  return (
    <div className="flex items-center gap-3">
      <Btn size="sm" variant="primary" loading={busy} onClick={() => run(fn, okMsg, after)}>{label}</Btn>
      {notice && <span className={`text-xs font-semibold ${notice.tone === 'ok' ? 'text-emerald-700' : 'text-red-700'}`}>{notice.msg}</span>}
    </div>
  );
}

// ───────────────────────── generic value renderers ─────────────────────────

function renderVal(v: unknown): ReactNode {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'object') return <span className="mono text-xs">{JSON.stringify(v)}</span>;
  return String(v);
}

function ObjView({ obj }: { obj: unknown }) {
  if (obj === null || obj === undefined) return <Empty msg="No data returned." />;
  if (typeof obj !== 'object' || Array.isArray(obj)) return <pre className={PRE}>{JSON.stringify(obj, null, 2)}</pre>;
  const entries = Object.entries(obj as Record<string, unknown>);
  if (!entries.length) return <Empty msg="No data returned." />;
  return <div className="px-1">{entries.map(([k, v]) => <KV key={k} k={k} v={renderVal(v)} mono />)}</div>;
}

function configItems(v: unknown): Record<string, unknown>[] | null {
  if (Array.isArray(v)) return v as Record<string, unknown>[];
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    for (const k of ['configuration', 'configurationKey', 'items', 'keys', 'data']) {
      if (Array.isArray(o[k])) return o[k] as Record<string, unknown>[];
    }
  }
  return null;
}

const whenOf = (o: Record<string, unknown>, ...keys: string[]) => { const v = f(o, ...keys); return v === '—' ? '—' : when(v); };

// Live OCPP commands — parameterized via FormModal field sets.
const LIVE_ACTIONS: { label: string; danger?: boolean; fields: FF[]; initial: Record<string, string>; run: (n: string, id: string, body: Record<string, unknown>) => Promise<unknown> }[] = [
  { label: 'Remote Start', fields: [{ name: 'connectorId', label: 'Connector ID', kind: 'number' }, { name: 'idTag', label: 'ID tag (driver token)', kind: 'text', optional: true, placeholder: 'optional' }], initial: { connectorId: '1', idTag: '' }, run: (n, id, b) => api.remoteStart(n, id, b) },
  { label: 'Remote Stop', fields: [{ name: 'transactionId', label: 'Transaction ID', kind: 'text', optional: true, placeholder: 'optional — stops active tx' }], initial: { transactionId: '' }, run: (n, id, b) => api.remoteStop(n, id, b) },
  { label: 'Reboot', danger: true, fields: [{ name: 'type', label: 'Reset type', kind: 'select', options: opt(['Soft', 'Hard']) }], initial: { type: 'Soft' }, run: (n, id, b) => api.reboot(n, id, b) },
  { label: 'Unlock', fields: [{ name: 'connectorId', label: 'Connector ID', kind: 'number' }], initial: { connectorId: '1' }, run: (n, id, b) => api.unlock(n, id, b) },
  { label: 'Change Availability', danger: true, fields: [{ name: 'type', label: 'Availability', kind: 'select', options: opt(['Inoperative', 'Operative']) }, { name: 'connectorId', label: 'Connector ID (0 = whole charger)', kind: 'number' }], initial: { type: 'Inoperative', connectorId: '0' }, run: (n, id, b) => api.changeAvailability(n, id, b) },
  { label: 'Trigger Message', fields: [{ name: 'requestedMessage', label: 'Requested message', kind: 'select', options: opt(['StatusNotification', 'BootNotification', 'Heartbeat', 'MeterValues', 'FirmwareStatusNotification', 'DiagnosticsStatusNotification', 'SignChargingStationCertificate']) }, { name: 'connectorId', label: 'Connector ID', kind: 'number', optional: true }], initial: { requestedMessage: 'StatusNotification', connectorId: '' }, run: (n, id, b) => api.triggerMessage(n, id, b) },
];

// ───────────────────────── page ─────────────────────────

export function ChargerDetail() {
  const network = useNetwork();
  const navigate = useNavigate();
  const { id = '' } = useParams();

  const cRes = useResource(() => api.charger(network, id), [network, id], !!network && !!id);
  const charger = cRes.data;

  const [active, setActive] = useState('Overview');
  const [liveIdx, setLiveIdx] = useState<number | null>(null);
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [toast, setToast] = useState<{ label: string; ok: boolean } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  if (!network) return <Empty msg="Select a network to continue." />;
  if (cRes.loading) return <Spinner />;
  if (cRes.error) return <ErrorBox error={cRes.error} />;
  if (!charger) return <Empty msg="Charger not found." />;

  const cr = charger as unknown as Record<string, unknown>;

  return (
    <>
      {/* Header */}
      <div className="mb-6">
        <Link to="/chargers" className="text-sm font-medium text-[color:var(--color-ink-soft)] hover:text-[color:var(--color-ink)]">← Chargers</Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-extrabold tracking-tight mono">{charger.uid}</h1>
            <StatusPill value={charger.status} />
          </div>
          <div className="flex items-center gap-2">
            <Btn size="sm" variant="ghost" onClick={() => setShowEdit(true)}>Edit</Btn>
            <Btn size="sm" variant="danger" onClick={() => setShowDelete(true)}>Delete</Btn>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-[color:var(--color-ink-soft)]">
          <span className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${charger.isOnline ? 'bg-emerald-500' : 'bg-slate-300'}`} />
            {charger.isOnline ? 'online' : 'offline'} · last heartbeat {ago(charger.lastHeartbeat)}
          </span>
          <span className="rounded-full bg-[color:var(--color-brand-50)] text-[color:var(--color-brand-700)] px-2.5 py-0.5 text-xs font-semibold">OCPP {charger.ocppVersion ?? '—'}</span>
          <span>fw {charger.firmwareVersion ?? '—'}</span>
          <span>Security Profile {charger.securityProfile}</span>
        </div>
        <p className="mt-1.5 text-[13px] text-[color:var(--color-ink-soft)] mono">GET · PATCH · DELETE /cpms/v1/chargers/{id} · X-Network-Id</p>
      </div>

      {/* Live control */}
      <Card title="Live control" className="mb-5" right={toast && (
        <span className={`text-xs font-semibold ${toast.ok ? 'text-emerald-700' : 'text-red-700'}`}>{toast.label} sent ✓</span>
      )}>
        <div className="p-5 flex flex-wrap gap-2">
          {LIVE_ACTIONS.map((a, i) => (
            <Btn key={a.label} variant={a.danger ? 'danger' : 'ghost'} onClick={() => setLiveIdx(i)}>{a.label}</Btn>
          ))}
        </div>
      </Card>

      <Tabs tabs={TABS} active={active} onChange={setActive} />

      {active === 'Overview' && <OverviewTab c={charger} />}
      {active === 'Connectors' && <ConnectorsTab network={network} chargerId={id} connectors={charger.connectors} reload={cRes.reload} />}
      {active === 'Configuration' && <ConfigTab network={network} id={id} />}
      {active === 'Commands' && <CommandsTab network={network} id={id} />}
      {active === 'Charging Profiles' && <ProfilesTab network={network} id={id} />}
      {active === 'Monitoring' && <MonitoringTab network={network} id={id} />}
      {active === 'Display' && <DisplayTab network={network} id={id} />}
      {active === 'Device Model' && <DeviceModelTab network={network} id={id} />}
      {active === 'Firmware' && <FirmwareTab network={network} id={id} />}
      {active === 'Certificates' && <CertificatesTab network={network} id={id} />}
      {active === 'Diagnostics' && <DiagnosticsTab network={network} id={id} />}

      {/* Live command modal */}
      {liveIdx !== null && (() => {
        const a = LIVE_ACTIONS[liveIdx];
        return (
          <FormModal
            title={`Live · ${a.label}`}
            intro={<>Send <b>{a.label}</b> to <span className="mono">{charger.uid}</span> over OCPP.</>}
            fields={a.fields}
            initial={a.initial}
            danger={a.danger}
            submitLabel="Send command"
            okMsg={`${a.label} sent`}
            onSubmit={(body) => a.run(network, id, body)}
            onSuccess={() => { setToast({ label: a.label, ok: true }); setLiveIdx(null); }}
            onClose={() => setLiveIdx(null)}
          />
        );
      })()}

      {/* Edit charger */}
      {showEdit && (
        <FormModal
          title="Edit charger"
          submitLabel="Save changes"
          okMsg="Charger updated."
          fields={[
            { name: 'name', label: 'Name', placeholder: 'display name' },
            { name: 'physicalReference', label: 'Physical reference', placeholder: 'e.g. Bay A-3' },
            { name: 'maxPowerKw', label: 'Max power (kW)', kind: 'number' },
            { name: 'location', label: 'Location UUID', placeholder: 'location id' },
          ]}
          initial={{
            name: String(cr.name ?? ''),
            physicalReference: String(cr.physicalReference ?? ''),
            maxPowerKw: charger.maxPowerKw != null ? String(charger.maxPowerKw) : '',
            location: String(charger.locationUuid ?? ''),
          }}
          onSubmit={(body) => api.updateCharger(network, id, body)}
          onSuccess={() => cRes.reload()}
          onClose={() => setShowEdit(false)}
        />
      )}

      {/* Delete charger */}
      {showDelete && (
        <ConfirmModal
          title="Delete charger"
          danger
          confirmLabel="Delete charger"
          okMsg="Charger deleted."
          body={<>Permanently delete <span className="mono">{charger.uid}</span> and all its connectors? This cannot be undone.</>}
          onConfirm={() => api.deleteCharger(network, id)}
          onSuccess={() => navigate('/chargers')}
          onClose={() => setShowDelete(false)}
        />
      )}
    </>
  );
}

// ───────────────────────── tabs ─────────────────────────

function OverviewTab({ c }: { c: ChargerDetailT }) {
  return (
    <Card title="Charger information">
      <div className="px-5 py-3">
        <KV k="Charger ID" v={c.id} mono />
        <KV k="Serial" v={c.serialNumber ?? '—'} mono />
        <KV k="Model UUID" v={c.modelUuid ?? '—'} mono />
        <KV k="Manufacturer UUID" v={c.manufacturerUuid ?? '—'} mono />
        <KV k="Location" v={c.locationName ?? '—'} />
        <KV k="OCPP" v={c.ocppVersion ?? '—'} />
        <KV k="Firmware" v={c.firmwareVersion ?? '—'} />
        <KV k="Max Power" v={`${num(c.maxPowerKw)} kW`} />
        <KV k="Security Profile" v={String(c.securityProfile)} />
        <KV k="Last Heartbeat" v={when(c.lastHeartbeat)} />
      </div>
    </Card>
  );
}

type CMod =
  | { kind: 'add' }
  | { kind: 'edit'; c: ConnectorSummary }
  | { kind: 'limit'; c: ConnectorSummary }
  | { kind: 'del'; c: ConnectorSummary }
  | { kind: 'clearLimit' }
  | null;

function connectorFields(c?: ConnectorSummary): FF[] {
  return [
    { name: 'number', label: 'Connector number', kind: 'number' },
    { name: 'standard', label: 'Standard', kind: 'select', options: withVal(STANDARDS, c?.standard) },
    { name: 'format', label: 'Format', kind: 'select', options: withVal(FORMATS, c?.format) },
    { name: 'powerType', label: 'Power type', kind: 'select', options: withVal(POWER_TYPES, c?.powerType) },
    { name: 'maxPowerKw', label: 'Max power (kW)', kind: 'number', optional: true },
  ];
}

function ConnectorsTab({ network, chargerId, connectors, reload }: { network: string; chargerId: string; connectors: ConnectorSummary[]; reload: () => void }) {
  const [mod, setMod] = useState<CMod>(null);
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-[color:var(--color-ink-soft)] mono">POST/PUT/DELETE /cpms/v1/connectors · PUT /smart-charging/{'{id}'}/limit</span>
        <div className="flex items-center gap-2">
          <Btn size="sm" variant="ghost" onClick={() => setMod({ kind: 'clearLimit' })}>Clear limit</Btn>
          <Btn size="sm" variant="primary" onClick={() => setMod({ kind: 'add' })}>Add connector</Btn>
        </div>
      </div>

      {!connectors?.length ? <Empty msg="No connectors reported for this charger." /> : (
        <Table
          columns={['#', 'Standard', 'Format', 'Power Type', 'Max kW', 'Status', '']}
          numeric={[4]}
          rows={connectors.map((k) => [
            k.number,
            <span className="mono">{k.standard}</span>,
            k.format,
            k.powerType,
            num(k.maxPowerKw, 1),
            <StatusPill value={k.status} />,
            <div className="flex justify-end gap-1.5">
              <Btn size="sm" variant="ghost" onClick={() => setMod({ kind: 'limit', c: k })}>Limit</Btn>
              <Btn size="sm" variant="ghost" onClick={() => setMod({ kind: 'edit', c: k })}>Edit</Btn>
              <Btn size="sm" variant="danger" onClick={() => setMod({ kind: 'del', c: k })}>Delete</Btn>
            </div>,
          ])}
        />
      )}

      {mod?.kind === 'add' && (
        <FormModal
          title="Add connector"
          submitLabel="Add connector"
          okMsg="Connector added."
          fields={connectorFields()}
          initial={{ number: String((connectors?.length ?? 0) + 1), standard: STANDARDS[0], format: FORMATS[0], powerType: POWER_TYPES[0], maxPowerKw: '' }}
          onSubmit={(body) => api.addConnector(network, chargerId, body)}
          onSuccess={reload}
          onClose={() => setMod(null)}
        />
      )}
      {mod?.kind === 'edit' && (
        <FormModal
          title={`Edit connector #${mod.c.number}`}
          submitLabel="Save connector"
          okMsg="Connector updated."
          fields={connectorFields(mod.c)}
          initial={{ number: String(mod.c.number), standard: mod.c.standard, format: mod.c.format, powerType: mod.c.powerType, maxPowerKw: mod.c.maxPowerKw != null ? String(mod.c.maxPowerKw) : '' }}
          onSubmit={(body) => api.updateConnector(network, mod.c.id, body)}
          onSuccess={reload}
          onClose={() => setMod(null)}
        />
      )}
      {mod?.kind === 'limit' && (
        <FormModal
          title={`Charge limit · connector #${mod.c.number}`}
          submitLabel="Set limit"
          okMsg="Charge limit set."
          intro={<>Cap the smart-charging output for connector #{mod.c.number}. Use “Clear limit” to revert the charger to its default profile.</>}
          fields={[
            { name: 'limit', label: 'Limit', kind: 'number' },
            { name: 'unit', label: 'Unit', kind: 'select', options: [{ value: 'A', label: 'Amps (A)' }, { value: 'W', label: 'Watts (W)' }] },
          ]}
          initial={{ limit: '', unit: 'A' }}
          transform={(p) => ({ ...p, connectorId: mod.c.number })}
          onSubmit={(body) => api.setScLimit(network, chargerId, body)}
          onSuccess={reload}
          onClose={() => setMod(null)}
        />
      )}
      {mod?.kind === 'del' && (
        <ConfirmModal
          title="Delete connector"
          danger
          confirmLabel="Delete connector"
          okMsg="Connector deleted."
          body={<>Delete connector <span className="mono">#{mod.c.number}</span> ({mod.c.standard})?</>}
          onConfirm={() => api.deleteConnector(network, mod.c.id)}
          onSuccess={reload}
          onClose={() => setMod(null)}
        />
      )}
      {mod?.kind === 'clearLimit' && (
        <ConfirmModal
          title="Clear charge limit"
          danger
          confirmLabel="Clear limit"
          okMsg="Charge limit cleared."
          body={<>Clear the smart-charging limit for this charger and revert to the default profile?</>}
          onConfirm={() => api.clearScLimit(network, chargerId)}
          onSuccess={reload}
          onClose={() => setMod(null)}
        />
      )}
    </>
  );
}

function ConfigTab({ network, id }: { network: string; id: string }) {
  const r = useResource(() => api.chargerConfig(network, id), [network, id]);
  const [edit, setEdit] = useState<{ key: string; value: string } | null>(null);
  if (r.loading) return <Spinner />;
  if (r.error) return <ErrorBox error={r.error} />;
  const items = configItems(r.data);
  return (
    <>
      <div className="mb-3 text-xs text-[color:var(--color-ink-soft)]">
        OCPP 1.6 ChangeConfiguration — edits send <span className="mono">POST /cpms/v1/chargers/{'{id}'}/configuration {'{key,value}'}</span>. (2.0.1 uses SetVariables; this console keeps it to key/value.)
      </div>
      {!items ? (
        r.data ? <Card className="p-5"><pre className={PRE}>{JSON.stringify(r.data, null, 2)}</pre></Card> : <Empty msg="No configuration available." />
      ) : !items.length ? <Empty msg="No configuration keys returned." /> : (
        <Table
          columns={['Key', 'Value', 'Read-only', '']}
          rows={items.map((it) => {
            const key = f(it, 'key', 'name');
            const val = f(it, 'value', 'currentValue');
            const ro = /true/i.test(f(it, 'readonly', 'readOnly'));
            return [
              <span className="mono">{key}</span>,
              <span className="mono">{val}</span>,
              ro ? 'yes' : 'no',
              <div className="flex justify-end">
                <Btn size="sm" variant="ghost" disabled={ro} onClick={() => setEdit({ key, value: val === '—' ? '' : val })}>Edit</Btn>
              </div>,
            ];
          })}
        />
      )}
      {edit && (
        <FormModal
          title={`Set · ${edit.key}`}
          submitLabel="Set value"
          okMsg="Configuration sent."
          intro={<>Change <span className="mono">{edit.key}</span> via ChangeConfiguration.</>}
          fields={[{ name: 'value', label: `Value`, optional: true }]}
          initial={{ value: edit.value }}
          transform={(_, vals) => ({ key: edit.key, value: vals.value ?? '' })}
          onSubmit={(body) => api.setConfig(network, id, body)}
          onSuccess={() => r.reload()}
          onClose={() => setEdit(null)}
        />
      )}
    </>
  );
}

function CommandsTab({ network, id }: { network: string; id: string }) {
  const r = useResource(() => api.chargerCommands(network, id), [network, id]);
  if (r.loading) return <Spinner />;
  if (r.error) return <ErrorBox error={r.error} />;
  const rows = (r.data?.data ?? []) as ChargerCommand[];
  if (!rows.length) return <Empty msg="No commands have been sent to this charger." />;
  return (
    <Table
      columns={['Action', 'Status', 'Response ms', 'When', 'By']}
      numeric={[2]}
      rows={rows.map((c) => [
        c.action ?? '—',
        <StatusPill value={c.status ?? ''} />,
        num(c.responseTimeMs, 0),
        when(c.timestamp),
        c.sentBy ?? '—',
      ])}
    />
  );
}

function ProfilesTab({ network, id }: { network: string; id: string }) {
  const r = useResource(() => api.chargerProfiles(network, id), [network, id]);
  if (r.loading) return <Spinner />;
  if (r.error) return <ErrorBox error={r.error} />;
  const rows = (r.data?.data ?? []) as ChargingProfile[];
  if (!rows.length) return <Empty msg="No charging profiles assigned." />;
  return (
    <Table
      columns={['Profile', 'Type', 'Active', 'Max kW', 'Valid']}
      numeric={[3]}
      rows={rows.map((p) => [
        p.profile?.name ?? '—',
        p.profile?.profileType ?? '—',
        <StatusPill value={p.isActive ? 'Active' : 'Inactive'} />,
        num(p.profile?.maxPowerKw, 1),
        `${when(p.startDate)} → ${when(p.endDate)}`,
      ])}
    />
  );
}

function MonitoringTab({ network, id }: { network: string; id: string }) {
  const r = useResource(() => api.monitoringEvents(network, id), [network, id]);
  const [setOpen, setSetOpen] = useState(false);
  const [clearId, setClearId] = useState<number | null>(null);
  const rows = (r.data?.data ?? []) as Record<string, unknown>[];
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-[color:var(--color-ink-soft)] mono">GET .../monitoring/events · POST .../monitoring/set (OCPP 2.x)</span>
        <Btn size="sm" variant="primary" onClick={() => setSetOpen(true)}>Set monitor</Btn>
      </div>
      {r.loading ? <Spinner /> : r.error ? <ErrorBox error={r.error} /> : !rows.length ? <Empty msg="No variable monitors reported (OCPP 2.x SetVariableMonitoring)." /> : (
        <Table
          dense
          columns={['Monitor', 'Component', 'Variable', 'Value', 'Type', 'Severity', 'When', '']}
          rows={rows.map((m) => {
            const mid = Number(f(m, 'monitorId', 'id'));
            return [
              <span className="mono">{f(m, 'monitorId', 'id')}</span>,
              f(m, 'component', 'componentName'),
              <span className="mono">{f(m, 'variable', 'variableName')}</span>,
              <span className="mono">{f(m, 'value', 'threshold')}</span>,
              f(m, 'type', 'monitorType'),
              f(m, 'severity'),
              whenOf(m, 'occurredAt', 'timestamp', 'createdAt'),
              Number.isFinite(mid)
                ? <div className="flex justify-end"><Btn size="sm" variant="danger" onClick={() => setClearId(mid)}>Clear</Btn></div>
                : null,
            ];
          })}
        />
      )}
      {setOpen && (
        <FormModal
          title="Set variable monitor"
          submitLabel="Set monitor"
          okMsg="Monitor set."
          fields={[
            { name: 'componentName', label: 'Component' },
            { name: 'variableName', label: 'Variable' },
            { name: 'type', label: 'Monitor type', kind: 'select', options: opt(['UpperThreshold', 'LowerThreshold', 'Delta', 'Periodic', 'PeriodicClockAligned']) },
            { name: 'value', label: 'Threshold / value', kind: 'number' },
            { name: 'severity', label: 'Severity (0–9)', kind: 'number' },
          ]}
          initial={{ type: 'UpperThreshold', severity: '5' }}
          onSubmit={(body) => api.setMonitoring(network, id, body)}
          onSuccess={() => r.reload()}
          onClose={() => setSetOpen(false)}
        />
      )}
      {clearId !== null && (
        <ConfirmModal
          title="Clear monitor"
          danger
          confirmLabel="Clear monitor"
          okMsg="Monitor cleared."
          body={<>Clear monitor <span className="mono">{clearId}</span>?</>}
          onConfirm={() => api.clearMonitoring(network, id, clearId)}
          onSuccess={() => r.reload()}
          onClose={() => setClearId(null)}
        />
      )}
    </>
  );
}

function DisplayTab({ network, id }: { network: string; id: string }) {
  const r = useResource(() => api.displayMessages(network, id), [network, id]);
  const [open, setOpen] = useState(false);
  const [clearId, setClearId] = useState<number | null>(null);
  const rows = (r.data?.data ?? []) as Record<string, unknown>[];
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-[color:var(--color-ink-soft)] mono">GET/POST .../display-messages (OCPP 2.x)</span>
        <Btn size="sm" variant="primary" onClick={() => setOpen(true)}>Set message</Btn>
      </div>
      {r.loading ? <Spinner /> : r.error ? <ErrorBox error={r.error} /> : !rows.length ? <Empty msg="No display messages set on this charger." /> : (
        <Table
          dense
          columns={['Message', 'Priority', 'State', 'Text', 'Start', 'End', '']}
          rows={rows.map((m) => {
            const mid = Number(f(m, 'id', 'messageId'));
            return [
              <span className="mono">{f(m, 'id', 'messageId')}</span>,
              f(m, 'priority'),
              f(m, 'state'),
              f(m, 'message', 'content', 'text'),
              whenOf(m, 'startDateTime', 'startTime', 'start'),
              whenOf(m, 'endDateTime', 'endTime', 'end'),
              Number.isFinite(mid)
                ? <div className="flex justify-end"><Btn size="sm" variant="danger" onClick={() => setClearId(mid)}>Clear</Btn></div>
                : null,
            ];
          })}
        />
      )}
      {open && (
        <FormModal
          title="Set display message"
          submitLabel="Set message"
          okMsg="Display message set."
          fields={[
            { name: 'id', label: 'Message ID', kind: 'number' },
            { name: 'priority', label: 'Priority', kind: 'select', options: opt(['AlwaysFront', 'InFront', 'NormalCycle']) },
            { name: 'state', label: 'State (optional)', kind: 'select', optional: true, options: opt(['Idle', 'Charging', 'Faulted', 'Unavailable']) },
            { name: 'message', label: 'Message text', kind: 'textarea', placeholder: 'Shown on the charger screen' },
          ]}
          initial={{ id: '1', priority: 'NormalCycle', state: '' }}
          onSubmit={(body) => api.setDisplayMessage(network, id, body)}
          onSuccess={() => r.reload()}
          onClose={() => setOpen(false)}
        />
      )}
      {clearId !== null && (
        <ConfirmModal
          title="Clear display message"
          danger
          confirmLabel="Clear message"
          okMsg="Display message cleared."
          body={<>Clear display message <span className="mono">{clearId}</span>?</>}
          onConfirm={() => api.clearDisplayMessage(network, id, clearId)}
          onSuccess={() => r.reload()}
          onClose={() => setClearId(null)}
        />
      )}
    </>
  );
}

function DeviceModelTab({ network, id }: { network: string; id: string }) {
  const r = useResource(() => api.deviceModel(network, id), [network, id]);
  return (
    <>
      <div className="mb-3">
        <InlineAction label="Refresh device model" okMsg="Report requested — reload shortly." run={() => api.deviceModelReport(network, id)} after={() => r.reload()} />
      </div>
      {r.loading ? <Spinner /> : r.error ? <ErrorBox error={r.error} /> : (() => {
        const rows = (r.data?.data ?? []) as DeviceModelVar[];
        if (!rows.length) return <Empty msg="No device model reported (OCPP 2.x only)." />;
        return (
          <Table
            dense
            columns={['Component', 'Variable', 'Attr', 'Value', 'Mutability', 'Unit']}
            rows={rows.map((v) => [
              v.componentName ?? '—',
              <span className="mono">{v.variableName ?? '—'}</span>,
              v.attributeType ?? '—',
              <span className="mono">{v.attributeValue ?? '—'}</span>,
              v.mutability ?? '—',
              v.unit ?? '—',
            ])}
          />
        );
      })()}
    </>
  );
}

function FirmwareTab({ network, id }: { network: string; id: string }) {
  const status = useResource(() => api.firmwareStatus(network, id), [network, id]);
  const catalog = useResource(() => api.firmwareCatalog(network), [network]);
  const [apply, setApply] = useState<string | null>(null); // null = closed, '' = generic, else preselect firmware id
  const cat = (catalog.data?.data ?? []) as Record<string, unknown>[];
  return (
    <>
      <div className="grid gap-5 md:grid-cols-2 mb-5">
        <Card title="Firmware status" right={<Btn size="sm" variant="primary" onClick={() => setApply('')}>Apply firmware…</Btn>}>
          <div className="px-5 py-3">{status.loading ? <Spinner /> : status.error ? <ErrorBox error={status.error} /> : <ObjView obj={status.data ?? null} />}</div>
        </Card>
        <div>
          <div className="text-sm font-semibold mb-2">Firmware catalog</div>
          {catalog.loading ? <Spinner /> : catalog.error ? <ErrorBox error={catalog.error} /> : !cat.length ? <Empty msg="No firmware in catalog." /> : (
            <Table
              dense
              columns={['Version', 'Vendor', 'Model', '']}
              rows={cat.map((fw) => [
                <span className="mono">{f(fw, 'version', 'firmwareVersion')}</span>,
                f(fw, 'vendor', 'manufacturer', 'manufacturerName'),
                f(fw, 'model', 'chargerModel', 'modelName'),
                <div className="flex justify-end"><Btn size="sm" variant="ghost" onClick={() => setApply(String(f(fw, 'id', 'firmwareId', 'uuid')))}>Apply</Btn></div>,
              ])}
            />
          )}
        </div>
      </div>
      {apply !== null && (
        <FormModal
          title="Apply firmware update"
          submitLabel="Send update"
          okMsg="Firmware update requested."
          intro={<>Schedule an UpdateFirmware to <span className="mono">{id}</span>. Pick a catalog build or supply a URL.</>}
          fields={[
            { name: 'firmwareId', label: 'Firmware (from catalog)', kind: 'select', optional: true, options: cat.map((fw) => ({ value: String(f(fw, 'id', 'firmwareId', 'uuid')), label: `${f(fw, 'version', 'firmwareVersion')} · ${f(fw, 'model', 'modelName')}` })) },
            { name: 'location', label: '…or firmware URL', optional: true, placeholder: 'https://…/firmware.bin' },
            { name: 'retrieveDateTime', label: 'Retrieve at (ISO, optional)', optional: true, placeholder: '2026-01-01T00:00:00Z' },
          ]}
          initial={{ firmwareId: apply || '' }}
          onSubmit={(body) => api.updateFirmware(network, id, body)}
          onSuccess={() => status.reload()}
          onClose={() => setApply(null)}
        />
      )}
    </>
  );
}

function CertificatesTab({ network, id }: { network: string; id: string }) {
  const r = useResource(() => api.certificates(network, id), [network, id]);
  if (r.loading) return <Spinner />;
  if (r.error) return <ErrorBox error={r.error} />;
  const rows = (r.data?.data ?? []) as Certificate[];
  if (!rows.length) return <Empty msg="No certificates installed." />;
  return (
    <Table
      columns={['Subject CN', 'Issuer CN', 'Serial', 'Valid From', 'Valid To', 'Status']}
      rows={rows.map((c) => [
        c.subjectCN ?? '—',
        c.issuerCN ?? '—',
        <span className="mono">{c.serialNumber ?? '—'}</span>,
        when(c.notBefore),
        when(c.notAfter),
        <StatusPill value={c.status ?? ''} />,
      ])}
    />
  );
}

function DiagnosticsTab({ network, id }: { network: string; id: string }) {
  const health = useResource(() => api.diagnostics(network, id).catch(() => null), [network, id]);
  const fw = useResource(() => api.firmwareStatus(network, id).catch(() => null), [network, id]);
  const files = useResource(() => api.diagnosticFiles(network, id), [network, id]);
  const [fetchOpen, setFetchOpen] = useState(false);
  const frows = (files.data?.data ?? []) as Record<string, unknown>[];
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-[color:var(--color-ink-soft)] mono">POST .../diagnostics/fetch · GET /diagnostic-files</span>
        <Btn size="sm" variant="primary" onClick={() => setFetchOpen(true)}>Fetch diagnostics</Btn>
      </div>
      <div className="grid gap-5 md:grid-cols-2 mb-5">
        <Card title="Health snapshot"><div className="px-5 py-3">{health.loading ? <Spinner /> : <ObjView obj={health.data ?? null} />}</div></Card>
        <Card title="Firmware status"><div className="px-5 py-3">{fw.loading ? <Spinner /> : <ObjView obj={fw.data ?? null} />}</div></Card>
      </div>
      <div className="text-sm font-semibold mb-2">Diagnostic files</div>
      {files.loading ? <Spinner /> : files.error ? <ErrorBox error={files.error} /> : !frows.length ? <Empty msg="No diagnostic files uploaded." /> : (
        <Table
          columns={['File', 'Status', 'Size', 'Uploaded', '']}
          rows={frows.map((file) => {
            const url = f(file, 'url', 'location', 'downloadUrl', 'fileUrl');
            return [
              <span className="mono">{f(file, 'fileName', 'name', 'file')}</span>,
              <StatusPill value={f(file, 'status') === '—' ? '' : f(file, 'status')} />,
              f(file, 'size', 'sizeBytes', 'fileSize'),
              whenOf(file, 'uploadedAt', 'createdAt', 'timestamp'),
              url === '—' ? null : <div className="flex justify-end"><a className="text-xs font-semibold text-[color:var(--color-brand-600)] underline" href={url} target="_blank" rel="noreferrer">open</a></div>,
            ];
          })}
        />
      )}
      {fetchOpen && (
        <FormModal
          title="Fetch diagnostics"
          submitLabel="Request diagnostics"
          okMsg="Diagnostics requested — file appears once uploaded."
          intro={<>Ask <span className="mono">{id}</span> to upload a diagnostics bundle. All fields optional.</>}
          fields={[
            { name: 'location', label: 'Upload location URL (optional)', optional: true, placeholder: 'ftp://…' },
            { name: 'startTime', label: 'Start time (ISO, optional)', optional: true, placeholder: '2026-01-01T00:00:00Z' },
            { name: 'stopTime', label: 'Stop time (ISO, optional)', optional: true, placeholder: '2026-01-02T00:00:00Z' },
          ]}
          onSubmit={(body) => api.fetchDiagnostics(network, id, body)}
          onSuccess={() => files.reload()}
          onClose={() => setFetchOpen(false)}
        />
      )}
    </>
  );
}
