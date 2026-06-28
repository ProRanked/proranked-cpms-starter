import { useEffect, useState } from 'react';
import { useApp } from '../App';
import { api, ApiError, field, type Charger } from '../api';
import { PageHeader, Spinner, ErrorBox, Empty, Table, StatusPill } from '../components/ui';

export function Chargers() {
  const { selected } = useApp();
  const [chargers, setChargers] = useState<Charger[]>([]);
  const [err, setErr] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!selected) {
      setLoading(false);
      return;
    }
    let live = true;
    setLoading(true);
    setErr(null);
    api
      .chargers(selected)
      .then((c) => live && setChargers(c))
      .catch((e) => live && e instanceof ApiError && setErr(e))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [selected]);

  return (
    <>
      <PageHeader title="Chargers" sub="GET /cpms/v1/chargers · X-Network-Id = active network" />
      {!selected ? (
        <Empty msg="Select a network to load its chargers." />
      ) : loading ? (
        <Spinner />
      ) : err ? (
        <ErrorBox error={err} />
      ) : chargers.length === 0 ? (
        <Empty msg="No chargers in this network yet." />
      ) : (
        <Table
          columns={['Charger', 'Status', 'OCPP', 'Vendor / Model', 'Last seen']}
          rows={chargers.map((c) => [
            <span className="mono">{field(c, 'uid', 'chargePointId', 'id', 'uuid')}</span>,
            <StatusPill value={field(c, 'status', 'state')} />,
            field(c, 'ocppVersion', 'protocol'),
            `${field(c, 'manufacturer', 'vendor')} / ${field(c, 'model', 'modelName')}`,
            field(c, 'lastHeartbeat', 'lastSeen', 'updatedAt'),
          ])}
        />
      )}
    </>
  );
}
