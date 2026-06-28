import { useMemo, useState } from 'react';
import { useNetwork } from '../App';
import { api, f } from '../api';
import { useResource } from '../hooks';
import { PageHeader, Spinner, ErrorBox, Empty, Card, Table, Input, StatCard } from '../components/ui';

// Read-only reference of the supported-hardware catalog. Two server lists, no mutations.
//   GET /cpms/v1/manufacturers · GET /cpms/v1/charger-models
export function Catalog() {
  const network = useNetwork();
  const mans = useResource(() => api.manufacturers(network), [network], !!network);
  const models = useResource(() => api.chargerModels(network), [network], !!network);

  const [q, setQ] = useState('');

  const manRows = (mans.data?.data ?? []) as Record<string, unknown>[];
  const modelRows = (models.data?.data ?? []) as Record<string, unknown>[];

  const filteredModels = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return modelRows;
    return modelRows.filter((m) =>
      f(m, 'name').toLowerCase().includes(needle) ||
      f(m, 'manufacturerName', 'manufacturer').toLowerCase().includes(needle) ||
      f(m, 'model', 'sku', 'partNumber').toLowerCase().includes(needle));
  }, [modelRows, q]);

  if (!network) return <Empty msg="Select a network." />;

  return (
    <div>
      <PageHeader
        title="Hardware catalog"
        sub="GET /cpms/v1/manufacturers · /charger-models"
        right={
          <Input
            placeholder="Search models…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-60"
          />
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatCard label="Manufacturers" value={mans.loading ? '…' : manRows.length} />
        <StatCard label="Charger models" value={models.loading ? '…' : modelRows.length} accent />
        <StatCard label="Shown" value={models.loading ? '…' : filteredModels.length} hint={q ? `filtered by “${q}”` : 'all models'} />
      </div>

      <Card title="Manufacturers" className="mb-6">
        {mans.loading ? (
          <div className="px-5 pb-5"><Spinner label="Loading manufacturers…" /></div>
        ) : mans.error ? (
          <div className="px-5 pb-5"><ErrorBox error={mans.error} /></div>
        ) : manRows.length === 0 ? (
          <div className="px-5 pb-5"><Empty msg="No manufacturers in the catalog." /></div>
        ) : (
          <Table
            dense
            columns={['Name', 'Code', 'Website', 'Country', 'ID']}
            rows={manRows.map((m) => [
              f(m, 'name', 'displayName'),
              f(m, 'code', 'slug'),
              f(m, 'website', 'url'),
              f(m, 'country', 'countryCode'),
              <span className="mono">{f(m, 'id', 'uuid')}</span>,
            ])}
          />
        )}
      </Card>

      <Card title="Charger models">
        {models.loading ? (
          <div className="px-5 pb-5"><Spinner label="Loading charger models…" /></div>
        ) : models.error ? (
          <div className="px-5 pb-5"><ErrorBox error={models.error} /></div>
        ) : filteredModels.length === 0 ? (
          <div className="px-5 pb-5"><Empty msg={q ? 'No models match your search.' : 'No charger models in the catalog.'} /></div>
        ) : (
          <Table
            dense
            numeric={[2, 4]}
            columns={['Name', 'Manufacturer', 'Max power (kW)', 'Connectors', 'Ports', 'OCPP', 'ID']}
            rows={filteredModels.map((m) => [
              f(m, 'name', 'model', 'displayName'),
              f(m, 'manufacturerName', 'manufacturer'),
              f(m, 'maxPowerKw', 'maxPower', 'powerKw', 'powerKW'),
              f(m, 'connectorType', 'connectorStandard', 'standard', 'connectors'),
              f(m, 'connectorCount', 'ports', 'numConnectors'),
              f(m, 'ocppVersion', 'protocol', 'ocpp'),
              <span className="mono">{f(m, 'id', 'uuid')}</span>,
            ])}
          />
        )}
      </Card>
    </div>
  );
}
