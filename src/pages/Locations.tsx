import { useEffect, useMemo, useState } from 'react';
import { useNetwork } from '../App';
import { api, ApiError, f } from '../api';
import type { LocationSummary, LocationDetail } from '../types';
import { PageHeader, Spinner, ErrorBox, Empty, Table, Btn, Modal, Input, KV } from '../components/ui';

export function Locations() {
  const network = useNetwork();

  const [locations, setLocations] = useState<LocationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<ApiError | null>(null);
  const [q, setQ] = useState('');

  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<LocationDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    if (!network) return;
    let live = true;
    setLoading(true);
    setErr(null);
    api.locations(network)
      .then((res) => { if (live) setLocations(res.data); })
      .catch((e) => { if (live && e instanceof ApiError) setErr(e); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [network]);

  useEffect(() => {
    if (!network || !openId) return;
    let live = true;
    setDetail(null);
    setDetailLoading(true);
    api.location(network, openId)
      .then((d) => { if (live) setDetail(d); })
      .catch(() => { if (live) setDetail(null); })
      .finally(() => { if (live) setDetailLoading(false); });
    return () => { live = false; };
  }, [network, openId]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return locations;
    return locations.filter((l) =>
      (l.name ?? '').toLowerCase().includes(needle) || (l.city ?? '').toLowerCase().includes(needle),
    );
  }, [locations, q]);

  if (!network) return <Empty msg="Select a network to continue." />;

  return (
    <div>
      <PageHeader
        title="Locations"
        sub="GET /cpms/v1/locations"
        right={
          <Input
            placeholder="Search name or city…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-56"
          />
        }
      />

      {loading ? (
        <Spinner label="Loading locations…" />
      ) : err ? (
        <ErrorBox error={err} />
      ) : filtered.length === 0 ? (
        <Empty msg={q ? 'No locations match your search.' : 'No locations found for this network.'} />
      ) : (
        <Table
          columns={['Name', 'City / State', 'Country', 'Network', '']}
          rows={filtered.map((l) => [
            l.name || '—',
            [l.city, l.state].filter(Boolean).join(', ') || '—',
            l.country || '—',
            <span className="mono">{l.networkId}</span>,
            <Btn variant="ghost" onClick={() => setOpenId(l.id)}>View</Btn>,
          ])}
        />
      )}

      {openId && (
        <Modal title="Location" onClose={() => setOpenId(null)}>
          {detailLoading ? (
            <Spinner label="Loading location…" />
          ) : !detail ? (
            <Empty msg="Location details unavailable." />
          ) : (
            <div>
              <KV k="Name" v={detail.name || '—'} />
              <KV k="Address" v={f(detail as unknown as Record<string, unknown>, 'address')} />
              <KV k="Postal Code" v={detail.postalCode || '—'} mono />
              <KV k="City" v={detail.city || '—'} />
              <KV k="State" v={detail.state || '—'} />
              <KV k="Country" v={detail.country || '—'} />
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
