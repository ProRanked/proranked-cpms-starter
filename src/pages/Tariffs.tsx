import { useState } from 'react';
import { useNetwork } from '../App';
import { api, ApiError, f, money, num } from '../api';
import { useResource } from '../hooks';
import type { TariffDetail } from '../types';
import {
  Card, PageHeader, Spinner, ErrorBox, Empty, Table, StatusPill, KV, Btn, Modal, Input, Select, Field, Notice,
} from '../components/ui';

// ── form model ─────────────────────────────────────────────────────────────
interface TariffFormState {
  name: string; currency: string;
  energyRate: string; timeRate: string; sessionFee: string; idleRate: string;
  idleGracePeriodMinutes: string; taxRate: string; isFree: boolean;
  peakHoursStart: string; peakHoursEnd: string; peakMultiplier: string; weekendMultiplier: string;
}
const EMPTY: TariffFormState = {
  name: '', currency: 'USD', energyRate: '', timeRate: '', sessionFee: '', idleRate: '',
  idleGracePeriodMinutes: '', taxRate: '', isFree: false,
  peakHoursStart: '', peakHoursEnd: '', peakMultiplier: '', weekendMultiplier: '',
};
function fromDetail(d: TariffDetail): TariffFormState {
  const s = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(v));
  return {
    name: d.name ?? '', currency: d.currency ?? 'USD',
    energyRate: s(d.energyRate), timeRate: s(d.timeRate), sessionFee: s(d.sessionFee), idleRate: s(d.idleRate),
    idleGracePeriodMinutes: s(d.idleGracePeriodMinutes), taxRate: s(d.taxRate), isFree: d.isFree,
    peakHoursStart: d.peakHoursStart ?? '', peakHoursEnd: d.peakHoursEnd ?? '',
    peakMultiplier: s(d.peakMultiplier), weekendMultiplier: s(d.weekendMultiplier),
  };
}
function buildBody(s: TariffFormState): Record<string, unknown> {
  const n = (v: string) => (v.trim() === '' ? null : Number(v));
  return {
    name: s.name.trim(), currency: s.currency.trim() || 'USD',
    energyRate: n(s.energyRate), timeRate: n(s.timeRate), sessionFee: n(s.sessionFee),
    idleRate: n(s.idleRate) ?? 0, idleGracePeriodMinutes: n(s.idleGracePeriodMinutes) ?? 0,
    taxRate: n(s.taxRate), isFree: s.isFree,
    peakHoursStart: s.peakHoursStart.trim() || null, peakHoursEnd: s.peakHoursEnd.trim() || null,
    peakMultiplier: n(s.peakMultiplier), weekendMultiplier: n(s.weekendMultiplier),
  };
}
function errMsg(e: unknown, scope = 'cpms:write:tariffs'): string {
  if (e instanceof ApiError) return e.status === 403 ? `${e.message} — needs ${scope} / off by default` : `${e.code}: ${e.message}`;
  return String((e as Error)?.message ?? e);
}

// ── page ───────────────────────────────────────────────────────────────────
export function Tariffs() {
  const network = useNetwork();
  const tariffs = useResource(() => api.tariffs(network).then((r) => r.data), [network], !!network);
  const [showCreate, setShowCreate] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const [activeName, setActiveName] = useState('');
  const [notice, setNotice] = useState<{ tone: 'ok' | 'bad'; msg: string } | null>(null);

  if (!network) return <Empty msg="Select a network." />;

  return (
    <>
      <PageHeader
        title="Tariffs"
        sub="GET / POST / PUT / DELETE /cpms/v1/tariffs · /tariffs/{id}/assign"
        right={<Btn variant="primary" onClick={() => setShowCreate(true)}>Create tariff</Btn>}
      />

      {notice && <div className="mb-4"><Notice tone={notice.tone}>{notice.msg}</Notice></div>}

      {tariffs.loading ? (
        <Spinner label="Loading tariffs…" />
      ) : tariffs.error ? (
        <ErrorBox error={tariffs.error} />
      ) : !tariffs.data || tariffs.data.length === 0 ? (
        <Empty msg="No tariffs configured in this network yet." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {tariffs.data.map((t) => (
            <Card key={t.id} className="p-5 flex flex-col gap-4">
              <div className="flex items-start justify-between gap-2">
                <div className="font-bold text-base leading-tight">{t.name}</div>
                <StatusPill value={t.type} tone="info" />
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="mono text-[color:var(--color-ink-soft)]">{t.currency || '—'}</span>
                {t.isFree && <span className="inline-block rounded-full bg-emerald-50 text-emerald-700 px-2 py-0.5 font-semibold">Free</span>}
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Rate label="Energy" value={t.energyRate != null ? `${money(t.energyRate, t.currency)}/kWh` : '—'} />
                <Rate label="Time" value={t.timeRate != null ? `${money(t.timeRate, t.currency)}/h` : '—'} />
                <Rate label="Idle" value={money(t.idleRate, t.currency)} />
              </div>
              <div className="mt-auto pt-1">
                <Btn variant="ghost" onClick={() => { setActive(t.id); setActiveName(t.name); }}>Details</Btn>
              </div>
            </Card>
          ))}
        </div>
      )}

      {showCreate && (
        <Modal title="Create tariff" onClose={() => setShowCreate(false)}>
          <TariffForm
            initial={EMPTY}
            submitLabel="Create tariff"
            onSubmit={async (body) => {
              await api.createTariff(network, body);
              setShowCreate(false);
              setNotice({ tone: 'ok', msg: `Tariff "${String(body.name)}" created.` });
              tariffs.reload();
            }}
          />
        </Modal>
      )}

      {active && (
        <TariffModal
          network={network}
          tariffId={active}
          tariffName={activeName}
          onClose={() => setActive(null)}
          onReloadList={() => tariffs.reload()}
          notify={(tone, msg) => setNotice({ tone, msg })}
        />
      )}
    </>
  );
}

function Rate({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] font-semibold text-[color:var(--color-ink-soft)]">{label}</div>
      <div className="mt-0.5 text-sm font-semibold">{value}</div>
    </div>
  );
}

// ── shared create/edit form ──────────────────────────────────────────────────
function NumField({ label, value, onChange, suffix }: { label: string; value: string; onChange: (v: string) => void; suffix?: string }) {
  return (
    <Field label={suffix ? `${label} (${suffix})` : label}>
      <Input type="number" step="any" value={value} onChange={(e) => onChange(e.target.value)} placeholder="—" />
    </Field>
  );
}

function TariffForm({ initial, submitLabel, onSubmit }: { initial: TariffFormState; submitLabel: string; onSubmit: (body: Record<string, unknown>) => Promise<void> }) {
  const [s, setS] = useState<TariffFormState>(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = <K extends keyof TariffFormState>(k: K, v: TariffFormState[K]) => setS((p) => ({ ...p, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!s.name.trim()) { setErr('Name is required.'); return; }
    setBusy(true); setErr(null);
    try {
      await onSubmit(buildBody(s));
    } catch (ex) {
      setErr(errMsg(ex));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="max-h-[60vh] overflow-y-auto scroll-thin pr-1 grid grid-cols-2 gap-3">
        <div className="col-span-2"><Field label="Name"><Input value={s.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Standard AC" /></Field></div>
        <Field label="Currency"><Input value={s.currency} onChange={(e) => set('currency', e.target.value)} placeholder="USD" /></Field>
        <label className="flex items-end gap-2 text-sm font-semibold pb-2">
          <input type="checkbox" checked={s.isFree} onChange={(e) => set('isFree', e.target.checked)} />
          Free tariff (no charge)
        </label>

        <NumField label="Energy rate" suffix="/kWh" value={s.energyRate} onChange={(v) => set('energyRate', v)} />
        <NumField label="Time rate" suffix="/h" value={s.timeRate} onChange={(v) => set('timeRate', v)} />
        <NumField label="Session fee" value={s.sessionFee} onChange={(v) => set('sessionFee', v)} />
        <NumField label="Idle rate" value={s.idleRate} onChange={(v) => set('idleRate', v)} />
        <NumField label="Idle grace" suffix="min" value={s.idleGracePeriodMinutes} onChange={(v) => set('idleGracePeriodMinutes', v)} />
        <NumField label="Tax rate" suffix="%" value={s.taxRate} onChange={(v) => set('taxRate', v)} />

        <Field label="Peak hours start"><Input value={s.peakHoursStart} onChange={(e) => set('peakHoursStart', e.target.value)} placeholder="HH:MM" /></Field>
        <Field label="Peak hours end"><Input value={s.peakHoursEnd} onChange={(e) => set('peakHoursEnd', e.target.value)} placeholder="HH:MM" /></Field>
        <NumField label="Peak multiplier" suffix="×" value={s.peakMultiplier} onChange={(v) => set('peakMultiplier', v)} />
        <NumField label="Weekend multiplier" suffix="×" value={s.weekendMultiplier} onChange={(v) => set('weekendMultiplier', v)} />
      </div>

      {err && <Notice tone="bad">{err}</Notice>}

      <div className="flex justify-end gap-2 pt-1">
        <Btn type="submit" variant="primary" loading={busy}>{submitLabel}</Btn>
      </div>
    </form>
  );
}

// ── detail / edit / delete / assignments modal ───────────────────────────────
function TariffModal({ network, tariffId, tariffName, onClose, onReloadList, notify }: {
  network: string; tariffId: string; tariffName: string;
  onClose: () => void; onReloadList: () => void; notify: (tone: 'ok' | 'bad', msg: string) => void;
}) {
  const detail = useResource(() => api.tariff(network, tariffId), [network, tariffId]);
  const assignments = useResource(() => api.tariffAssignments(network, tariffId).then((r) => r.data), [network, tariffId]);
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [note, setNote] = useState<{ tone: 'ok' | 'bad'; msg: string } | null>(null);
  const [confirm, setConfirm] = useState<{ kind: 'delete' } | { kind: 'detach'; id: string; label: string } | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  // assign form
  const [scope, setScope] = useState('location');
  const [targetId, setTargetId] = useState('');
  const [assignBusy, setAssignBusy] = useState(false);

  const d = detail.data;
  const ccy = d?.currency ?? '';
  const peakWindow = d?.peakHoursStart && d?.peakHoursEnd ? `${d.peakHoursStart}–${d.peakHoursEnd}` : '—';

  async function doAssign(e: React.FormEvent) {
    e.preventDefault();
    if (scope !== 'network' && !targetId.trim()) { setNote({ tone: 'bad', msg: 'Enter a target id for this scope.' }); return; }
    setAssignBusy(true); setNote(null);
    try {
      const body: Record<string, unknown> = { scope };
      if (scope !== 'network') body.targetId = targetId.trim();
      await api.assignTariff(network, tariffId, body);
      setNote({ tone: 'ok', msg: `Tariff assigned at ${scope} scope.` });
      setTargetId('');
      assignments.reload();
    } catch (ex) {
      setNote({ tone: 'bad', msg: errMsg(ex) });
    } finally {
      setAssignBusy(false);
    }
  }

  async function runConfirm() {
    if (!confirm) return;
    setConfirmBusy(true);
    try {
      if (confirm.kind === 'delete') {
        await api.deleteTariff(network, tariffId);
        notify('ok', `Tariff "${tariffName}" deleted.`);
        onReloadList();
        onClose();
        return;
      }
      await api.detachAssignment(network, confirm.id);
      setNote({ tone: 'ok', msg: 'Assignment detached.' });
      assignments.reload();
      setConfirm(null);
    } catch (ex) {
      setNote({ tone: 'bad', msg: errMsg(ex) });
      setConfirm(null);
    } finally {
      setConfirmBusy(false);
    }
  }

  const title = mode === 'edit' ? `Edit · ${d?.name ?? tariffName}` : (d?.name ?? tariffName);

  return (
    <Modal title={title} onClose={onClose}>
      {detail.loading ? (
        <Spinner label="Loading tariff…" />
      ) : detail.error ? (
        <ErrorBox error={detail.error} />
      ) : !d ? (
        <Empty msg="No detail available for this tariff." />
      ) : mode === 'edit' ? (
        <TariffForm
          initial={fromDetail(d)}
          submitLabel="Save changes"
          onSubmit={async (body) => {
            await api.updateTariff(network, tariffId, body);
            setMode('view');
            setNote({ tone: 'ok', msg: 'Tariff updated.' });
            detail.reload();
            onReloadList();
          }}
        />
      ) : (
        <div className="space-y-5">
          {note && <Notice tone={note.tone}>{note.msg}</Notice>}

          <div className="flex items-center gap-2">
            <StatusPill value={d.type} tone="info" />
            <span className="mono text-xs text-[color:var(--color-ink-soft)]">{ccy || '—'}</span>
            {d.isFree && <span className="inline-block rounded-full bg-emerald-50 text-emerald-700 px-2 py-0.5 text-xs font-semibold">Free</span>}
            <span className="ml-auto mono text-[11px] text-[color:var(--color-ink-soft)]">{d.id}</span>
          </div>

          <div>
            <KV k="Session fee" v={d.sessionFee != null ? money(d.sessionFee, ccy) : '—'} />
            <KV k="Energy rate" v={d.energyRate != null ? `${money(d.energyRate, ccy)}/kWh` : '—'} />
            <KV k="Time rate" v={d.timeRate != null ? `${money(d.timeRate, ccy)}/h` : '—'} />
            <KV k="Idle rate" v={money(d.idleRate, ccy)} />
            <KV k="Idle fee enabled" v={d.idleFeeEnabled ? 'Yes' : 'No'} />
            <KV k="Idle grace (min)" v={num(d.idleGracePeriodMinutes, 0)} />
            <KV k="Idle fee maximum" v={d.idleFeeMaximum != null ? money(d.idleFeeMaximum, ccy) : '—'} />
            <KV k="Tax rate" v={d.taxRate != null ? `${num(d.taxRate, 2)}%` : '—'} />
            <KV k="Peak window" v={peakWindow} mono />
            <KV k="Peak multiplier" v={d.peakMultiplier != null ? `${num(d.peakMultiplier, 2)}×` : '—'} />
            <KV k="Weekend multiplier" v={d.weekendMultiplier != null ? `${num(d.weekendMultiplier, 2)}×` : '—'} />
          </div>

          {/* assignments */}
          <div>
            <p className="mb-2 text-[13px] font-semibold text-[color:var(--color-ink-soft)]">Assignments · GET /tariffs/{'{id}'}/assignments</p>
            {assignments.loading ? (
              <Spinner label="Loading assignments…" />
            ) : assignments.error ? (
              <Notice tone="bad">{errMsg(assignments.error, 'cpms:read:tariffs')}</Notice>
            ) : !assignments.data || assignments.data.length === 0 ? (
              <Empty msg="No assignments for this tariff." />
            ) : (
              <Table
                dense
                columns={['Scope', 'Location', 'Charger', '']}
                rows={assignments.data.map((a) => [
                  <StatusPill key="s" value={f(a, 'scope')} />,
                  f(a, 'locationName'),
                  <span key="c" className="mono">{f(a, 'chargerUid')}</span>,
                  <Btn key="x" size="sm" variant="danger" onClick={() => setConfirm({ kind: 'detach', id: String(a.assignmentId), label: f(a, 'scope', 'locationName', 'chargerUid') })}>Detach</Btn>,
                ])}
              />
            )}

            {/* assign form */}
            <form onSubmit={doAssign} className="mt-3 flex flex-wrap items-end gap-2">
              <Field label="Scope">
                <Select value={scope} onChange={setScope}>
                  <option value="network">network</option>
                  <option value="location">location</option>
                  <option value="charger">charger</option>
                </Select>
              </Field>
              <div className="flex-1 min-w-[10rem]">
                <Field label="Target id">
                  <Input value={targetId} onChange={(e) => setTargetId(e.target.value)} placeholder={scope === 'network' ? 'whole network' : `${scope} id / uid`} disabled={scope === 'network'} className="mono" />
                </Field>
              </div>
              <Btn type="submit" variant="primary" loading={assignBusy}>Assign</Btn>
            </form>
          </div>

          {/* footer actions */}
          <div className="flex justify-end gap-2 border-t border-black/5 pt-4">
            <Btn variant="danger" onClick={() => setConfirm({ kind: 'delete' })}>Delete</Btn>
            <Btn variant="primary" onClick={() => { setNote(null); setMode('edit'); }}>Edit</Btn>
          </div>
        </div>
      )}

      {confirm && (
        <Modal title={confirm.kind === 'delete' ? 'Delete tariff' : 'Detach assignment'} onClose={() => !confirmBusy && setConfirm(null)}>
          <div className="space-y-4">
            <p className="text-sm">
              {confirm.kind === 'delete'
                ? <>Permanently delete tariff <b>{d?.name ?? tariffName}</b>? Chargers using it will fall back to the network default.</>
                : <>Detach the <b>{confirm.label}</b> assignment from this tariff?</>}
            </p>
            <div className="flex justify-end gap-2">
              <Btn variant="ghost" onClick={() => setConfirm(null)} disabled={confirmBusy}>Cancel</Btn>
              <Btn variant="danger" loading={confirmBusy} onClick={runConfirm}>{confirm.kind === 'delete' ? 'Delete tariff' : 'Detach'}</Btn>
            </div>
          </div>
        </Modal>
      )}
    </Modal>
  );
}
