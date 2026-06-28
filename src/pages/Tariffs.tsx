import { useEffect, useState } from 'react';
import { useNetwork } from '../App';
import { api, ApiError, f, money, num } from '../api';
import type { TariffSummary, TariffDetail, TariffAssignment } from '../types';
import { Card, PageHeader, Spinner, ErrorBox, Empty, Table, StatusPill, KV, Btn, Modal } from '../components/ui';

export function Tariffs() {
  const network = useNetwork();
  const [tariffs, setTariffs] = useState<TariffSummary[]>([]);
  const [err, setErr] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<TariffSummary | null>(null);

  useEffect(() => {
    if (!network) return;
    let live = true;
    setLoading(true);
    setErr(null);
    api
      .tariffs(network)
      .then((r) => { if (live) setTariffs(r.data); })
      .catch((e) => { if (live && e instanceof ApiError) setErr(e); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [network]);

  if (!network) return <Empty msg="Select a network to continue." />;

  return (
    <>
      <PageHeader title="Tariffs" sub="GET /cpms/v1/tariffs" />
      {loading ? (
        <Spinner label="Loading tariffs…" />
      ) : err ? (
        <ErrorBox error={err} />
      ) : tariffs.length === 0 ? (
        <Empty msg="No tariffs configured in this network yet." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {tariffs.map((t) => (
            <Card key={t.id} className="p-5 flex flex-col gap-4">
              <div className="flex items-start justify-between gap-2">
                <div className="font-bold text-base leading-tight">{t.name}</div>
                <StatusPill value={t.type} tone="info" />
              </div>

              <div className="flex items-center gap-2 text-xs">
                <span className="mono text-[color:var(--color-ink-soft)]">{t.currency || '—'}</span>
                {t.isFree && (
                  <span className="inline-block rounded-full bg-emerald-50 text-emerald-700 px-2 py-0.5 font-semibold">Free</span>
                )}
              </div>

              <div className="grid grid-cols-3 gap-2">
                <Rate label="Energy" value={t.energyRate != null ? `${money(t.energyRate, t.currency)}/kWh` : '—'} />
                <Rate label="Time" value={t.timeRate != null ? `${money(t.timeRate, t.currency)}/h` : '—'} />
                <Rate label="Idle" value={money(t.idleRate, t.currency)} />
              </div>

              <div className="mt-auto pt-1">
                <Btn variant="ghost" onClick={() => setActive(t)}>Details</Btn>
              </div>
            </Card>
          ))}
        </div>
      )}

      {active && <TariffModal network={network} tariff={active} onClose={() => setActive(null)} />}
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

function TariffModal({ network, tariff, onClose }: { network: string; tariff: TariffSummary; onClose: () => void }) {
  const [detail, setDetail] = useState<TariffDetail | null>(null);
  const [assignments, setAssignments] = useState<TariffAssignment[]>([]);
  const [err, setErr] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setErr(null);
    Promise.all([
      api.tariff(network, tariff.id),
      api.tariffAssignments(network, tariff.id).then((r) => r.data).catch(() => [] as TariffAssignment[]),
    ])
      .then(([d, a]) => { if (live) { setDetail(d); setAssignments(a); } })
      .catch((e) => { if (live && e instanceof ApiError) setErr(e); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [network, tariff.id]);

  const ccy = detail?.currency ?? tariff.currency;
  const peakWindow = detail?.peakHoursStart && detail?.peakHoursEnd
    ? `${detail.peakHoursStart}–${detail.peakHoursEnd}`
    : '—';

  return (
    <Modal title={tariff.name} onClose={onClose}>
      {loading ? (
        <Spinner label="Loading tariff…" />
      ) : err ? (
        <ErrorBox error={err} />
      ) : !detail ? (
        <Empty msg="No detail available for this tariff." />
      ) : (
        <div className="space-y-5">
          <div className="flex items-center gap-2">
            <StatusPill value={detail.type} tone="info" />
            <span className="mono text-xs text-[color:var(--color-ink-soft)]">{ccy || '—'}</span>
            {detail.isFree && (
              <span className="inline-block rounded-full bg-emerald-50 text-emerald-700 px-2 py-0.5 text-xs font-semibold">Free</span>
            )}
          </div>

          <div>
            <KV k="Session fee" v={detail.sessionFee != null ? money(detail.sessionFee, ccy) : '—'} />
            <KV k="Energy rate" v={detail.energyRate != null ? `${money(detail.energyRate, ccy)}/kWh` : '—'} />
            <KV k="Time rate" v={detail.timeRate != null ? `${money(detail.timeRate, ccy)}/h` : '—'} />
            <KV k="Idle rate" v={money(detail.idleRate, ccy)} />
            <KV k="Idle fee enabled" v={detail.idleFeeEnabled ? 'Yes' : 'No'} />
            <KV k="Idle grace (min)" v={num(detail.idleGracePeriodMinutes, 0)} />
            <KV k="Idle fee maximum" v={detail.idleFeeMaximum != null ? money(detail.idleFeeMaximum, ccy) : '—'} />
            <KV k="Tax rate" v={detail.taxRate != null ? `${num(detail.taxRate, 2)}%` : '—'} />
            <KV k="Peak window" v={peakWindow} mono />
            <KV k="Peak multiplier" v={detail.peakMultiplier != null ? `${num(detail.peakMultiplier, 2)}×` : '—'} />
            <KV k="Weekend multiplier" v={detail.weekendMultiplier != null ? `${num(detail.weekendMultiplier, 2)}×` : '—'} />
          </div>

          <div>
            <p className="mb-2 text-[13px] font-semibold text-[color:var(--color-ink-soft)]">Assignments</p>
            {assignments.length === 0 ? (
              <Empty msg="No assignments for this tariff." />
            ) : (
              <Table
                dense
                columns={['Scope', 'Location', 'Charger']}
                rows={assignments.map((a) => [
                  <StatusPill key="s" value={f(a, 'scope')} />,
                  f(a, 'locationName'),
                  <span key="c" className="mono">{f(a, 'chargerUid')}</span>,
                ])}
              />
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
