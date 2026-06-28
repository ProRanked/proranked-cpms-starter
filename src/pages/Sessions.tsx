import { useEffect, useState } from 'react';
import { useApp } from '../App';
import { api, ApiError, field, type Session } from '../api';
import { PageHeader, Spinner, ErrorBox, Empty, Table, StatusPill } from '../components/ui';

export function Sessions() {
  const { selected } = useApp();
  const [sessions, setSessions] = useState<Session[]>([]);
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
      .sessions(selected)
      .then((s) => live && setSessions(s))
      .catch((e) => live && e instanceof ApiError && setErr(e))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [selected]);

  return (
    <>
      <PageHeader title="Sessions" sub="GET /cpms/v1/sessions · X-Network-Id = active network" />
      {!selected ? (
        <Empty msg="Select a network to load its sessions." />
      ) : loading ? (
        <Spinner />
      ) : err ? (
        <ErrorBox error={err} />
      ) : sessions.length === 0 ? (
        <Empty msg="No sessions in this network yet." />
      ) : (
        <Table
          columns={['Session', 'Status', 'Charger', 'Energy (kWh)', 'Started']}
          rows={sessions.map((s) => [
            <span className="mono">{field(s, 'id', 'sessionId', 'uuid', 'transactionId')}</span>,
            <StatusPill value={field(s, 'status', 'state')} />,
            <span className="mono">{field(s, 'chargerUid', 'chargePointId', 'chargerId')}</span>,
            field(s, 'energyKwh', 'kwh', 'energyDelivered', 'totalEnergy'),
            field(s, 'startedAt', 'startTime', 'createdAt'),
          ])}
        />
      )}
    </>
  );
}
