import { useEffect, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useNetwork } from '../App';
import { api, ApiError, f, num, when, ago } from '../api';
import type {
  ChargerDetail as ChargerDetailT, ConnectorSummary, ChargerCommand, ChargingProfile, DeviceModelVar, Certificate,
} from '../types';
import { Card, Spinner, ErrorBox, Empty, Table, StatusPill, Tabs, KV, Btn, Modal } from '../components/ui';

const TABS = ['Overview', 'Connectors', 'Configuration', 'Commands', 'Charging Profiles', 'Device Model', 'Certificates', 'Diagnostics'];

// Lifecycle commands sent over live OCPP. body shapes are fixed by the API contract.
const ACTIONS: { label: string; body: unknown; danger?: boolean; run: (n: string, id: string) => Promise<unknown> }[] = [
  { label: 'Remote Start', body: { connectorId: 1 }, run: (n, id) => api.remoteStart(n, id, { connectorId: 1 }) },
  { label: 'Remote Stop', body: {}, run: (n, id) => api.remoteStop(n, id, {}) },
  { label: 'Reboot', body: { type: 'Soft' }, danger: true, run: (n, id) => api.reboot(n, id, { type: 'Soft' }) },
  { label: 'Unlock', body: { connectorId: 1 }, run: (n, id) => api.unlock(n, id, { connectorId: 1 }) },
  { label: 'Change Availability', body: { type: 'Inoperative' }, danger: true, run: (n, id) => api.changeAvailability(n, id, { type: 'Inoperative' }) },
  { label: 'Trigger Message', body: { requestedMessage: 'StatusNotification' }, run: (n, id) => api.triggerMessage(n, id, { requestedMessage: 'StatusNotification' }) },
];

const PRE = 'mono text-xs whitespace-pre-wrap break-all bg-black/[0.03] rounded-lg p-3 overflow-x-auto';

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

export function ChargerDetail() {
  const network = useNetwork();
  const { id = '' } = useParams();

  const [charger, setCharger] = useState<ChargerDetailT | null>(null);
  const [err, setErr] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);

  const [active, setActive] = useState('Overview');
  const [tabData, setTabData] = useState<Record<string, unknown>>({});
  const [tabLoading, setTabLoading] = useState<Record<string, boolean>>({});

  const [pending, setPending] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<{ label: string; ok: boolean; msg?: string } | null>(null);

  // Load the charger detail (drives Overview + Connectors + the header).
  useEffect(() => {
    if (!network || !id) return;
    let live = true;
    setLoading(true);
    setErr(null);
    setCharger(null);
    api.charger(network, id)
      .then((c) => { if (live) setCharger(c); })
      .catch((e) => { if (live && e instanceof ApiError) setErr(e); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [network, id]);

  // Auto-clear the action toast.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  // Composite cache key so switching network/charger naturally invalidates tab data.
  const keyFor = (tab: string) => `${network}:${id}:${tab}`;

  // Lazy-load each tab's data on first activation. Every fetch fails soft to null.
  useEffect(() => {
    if (!network || !id) return;
    if (active === 'Overview' || active === 'Connectors') return;
    const k = keyFor(active);
    if (tabData[k] !== undefined) return;
    let live = true;
    setTabLoading((s) => ({ ...s, [k]: true }));
    (async (): Promise<unknown> => {
      switch (active) {
        case 'Configuration': return api.chargerConfig(network, id);
        case 'Commands': return (await api.chargerCommands(network, id)).data;
        case 'Charging Profiles': return (await api.chargerProfiles(network, id)).data;
        case 'Device Model': return (await api.deviceModel(network, id)).data;
        case 'Certificates': return (await api.certificates(network, id)).data;
        case 'Diagnostics': return {
          diagnostics: await api.diagnostics(network, id).catch(() => null),
          firmware: await api.firmwareStatus(network, id).catch(() => null),
        };
        default: return null;
      }
    })()
      .then((d) => { if (live) setTabData((s) => ({ ...s, [k]: d ?? null })); })
      .catch(() => { if (live) setTabData((s) => ({ ...s, [k]: null })); })
      .finally(() => { if (live) setTabLoading((s) => ({ ...s, [k]: false })); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [network, id, active]);

  async function exec(idx: number) {
    if (!network) return;
    const a = ACTIONS[idx];
    setSending(true);
    try {
      await a.run(network, id);
      setToast({ label: a.label, ok: true });
    } catch (e) {
      setToast({ label: a.label, ok: false, msg: e instanceof ApiError ? e.message : 'Command failed.' });
    } finally {
      setSending(false);
      setPending(null);
    }
  }

  if (!network) return <Empty msg="Select a network to continue." />;
  if (loading) return <Spinner />;
  if (err) return <ErrorBox error={err} />;
  if (!charger) return <Empty msg="Charger not found." />;

  return (
    <>
      {/* Header */}
      <div className="mb-6">
        <Link to="/chargers" className="text-sm font-medium text-[color:var(--color-ink-soft)] hover:text-[color:var(--color-ink)]">← Chargers</Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-extrabold tracking-tight mono">{charger.uid}</h1>
          <StatusPill value={charger.status} />
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
        <p className="mt-1.5 text-[13px] text-[color:var(--color-ink-soft)] mono">GET /cpms/v1/chargers/{id} · X-Network-Id</p>
      </div>

      {/* Actions */}
      <Card title="Actions" className="mb-5" right={toast && (
        <span className={`text-xs font-semibold ${toast.ok ? 'text-emerald-700' : 'text-red-700'}`}>
          {toast.ok ? `${toast.label} sent ✓` : `${toast.label}: ${toast.msg}`}
        </span>
      )}>
        <div className="p-5 flex flex-wrap gap-2">
          {ACTIONS.map((a, i) => (
            <Btn key={a.label} variant={a.danger ? 'danger' : 'ghost'} onClick={() => setPending(i)}>{a.label}</Btn>
          ))}
        </div>
      </Card>

      <Tabs tabs={TABS} active={active} onChange={setActive} />

      {active === 'Overview' && <OverviewTab c={charger} />}
      {active === 'Connectors' && <ConnectorsTab connectors={charger.connectors} />}
      {active === 'Configuration' && <ConfigTab data={tabData[keyFor('Configuration')]} loading={!!tabLoading[keyFor('Configuration')]} />}
      {active === 'Commands' && <CommandsTab data={tabData[keyFor('Commands')]} loading={!!tabLoading[keyFor('Commands')]} />}
      {active === 'Charging Profiles' && <ProfilesTab data={tabData[keyFor('Charging Profiles')]} loading={!!tabLoading[keyFor('Charging Profiles')]} />}
      {active === 'Device Model' && <DeviceModelTab data={tabData[keyFor('Device Model')]} loading={!!tabLoading[keyFor('Device Model')]} />}
      {active === 'Certificates' && <CertificatesTab data={tabData[keyFor('Certificates')]} loading={!!tabLoading[keyFor('Certificates')]} />}
      {active === 'Diagnostics' && <DiagnosticsTab data={tabData[keyFor('Diagnostics')]} loading={!!tabLoading[keyFor('Diagnostics')]} />}

      {pending !== null && (
        <Modal title={`Confirm · ${ACTIONS[pending].label}`} onClose={() => { if (!sending) setPending(null); }}>
          <p className="text-sm">
            Send <span className="font-semibold">{ACTIONS[pending].label}</span> to <span className="mono">{charger.uid}</span>?
          </p>
          <pre className={`${PRE} mt-3`}>{JSON.stringify(ACTIONS[pending].body, null, 2)}</pre>
          <div className="mt-5 flex justify-end gap-2">
            <Btn variant="ghost" onClick={() => setPending(null)} disabled={sending}>Cancel</Btn>
            <Btn variant={ACTIONS[pending].danger ? 'danger' : 'primary'} onClick={() => exec(pending)} disabled={sending}>
              {sending ? 'Sending…' : 'Confirm'}
            </Btn>
          </div>
        </Modal>
      )}
    </>
  );
}

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

function ConnectorsTab({ connectors }: { connectors: ConnectorSummary[] }) {
  if (!connectors?.length) return <Empty msg="No connectors reported for this charger." />;
  return (
    <Table
      columns={['#', 'Standard', 'Format', 'Power Type', 'Max kW', 'Status']}
      numeric={[4]}
      rows={connectors.map((k) => [
        k.number,
        k.standard,
        k.format,
        k.powerType,
        num(k.maxPowerKw, 1),
        <StatusPill value={k.status} />,
      ])}
    />
  );
}

function ConfigTab({ data, loading }: { data: unknown; loading: boolean }) {
  if (loading && data === undefined) return <Spinner />;
  if (data === undefined || data === null) return <Empty msg="No configuration available." />;
  const items = configItems(data);
  if (!items) return <Card className="p-5"><pre className={PRE}>{JSON.stringify(data, null, 2)}</pre></Card>;
  if (!items.length) return <Empty msg="No configuration keys returned." />;
  return (
    <Table
      columns={['Key', 'Value', 'Read-only']}
      rows={items.map((it) => [
        <span className="mono">{f(it, 'key', 'name')}</span>,
        <span className="mono">{f(it, 'value', 'currentValue')}</span>,
        f(it, 'readonly', 'readOnly'),
      ])}
    />
  );
}

function CommandsTab({ data, loading }: { data: unknown; loading: boolean }) {
  if (loading && data === undefined) return <Spinner />;
  const rows = (Array.isArray(data) ? data : []) as ChargerCommand[];
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

function ProfilesTab({ data, loading }: { data: unknown; loading: boolean }) {
  if (loading && data === undefined) return <Spinner />;
  const rows = (Array.isArray(data) ? data : []) as ChargingProfile[];
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

function DeviceModelTab({ data, loading }: { data: unknown; loading: boolean }) {
  if (loading && data === undefined) return <Spinner />;
  const rows = (Array.isArray(data) ? data : []) as DeviceModelVar[];
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
}

function CertificatesTab({ data, loading }: { data: unknown; loading: boolean }) {
  if (loading && data === undefined) return <Spinner />;
  const rows = (Array.isArray(data) ? data : []) as Certificate[];
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

function DiagnosticsTab({ data, loading }: { data: unknown; loading: boolean }) {
  if (loading && data === undefined) return <Spinner />;
  if (data === undefined || data === null) return <Empty msg="No diagnostics available." />;
  const d = data as { diagnostics?: unknown; firmware?: unknown };
  if (d.diagnostics == null && d.firmware == null) return <Empty msg="No diagnostics or firmware status reported." />;
  return (
    <div className="grid gap-5 md:grid-cols-2">
      <Card title="Health snapshot"><div className="px-5 py-3"><ObjView obj={d.diagnostics ?? null} /></div></Card>
      <Card title="Firmware status"><div className="px-5 py-3"><ObjView obj={d.firmware ?? null} /></div></Card>
    </div>
  );
}
