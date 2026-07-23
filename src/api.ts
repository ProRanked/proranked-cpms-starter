import { config } from './config';
import { getUser, accessTokenOf } from './auth';
import type {
  Context, NetworkSummary, ChargerSummary, ChargerDetail, ConnectorSummary, SessionSummary, SessionDetail,
  MeterValue, SessionEvent, LocationSummary, LocationDetail, TariffSummary, TariffDetail, TariffAssignment,
  TxSummary, Kpis, Uptime, AnalyticsRollup, ChargerCommand, DeviceModelVar, Certificate, ChargingProfile,
  Webhook, WebhookDelivery, AuditEntry, Limits, Paged, Settings, TeamMember, ApiKey, FraudHold, NetworkWallet,
  LoadBalancing, Manufacturer, ChargerModel, IncreaseRequest,
} from './types';

// Browser-direct client for the public ProRanked CPMS API (/cpms/v1): operator bearer token + X-Network-Id,
// no backend, no secret. Handles the {data, pagination?, count?, success} envelope. See GAP-ANALYSIS.md for which
// capabilities are API-backed; pages name their endpoint in the header sub-line.

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

type Opts = { networkId?: string; method?: string; body?: unknown; query?: Record<string, string | number | undefined> };

function qstr(q?: Record<string, string | number | undefined>) {
  if (!q) return '';
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== '') p.set(k, String(v));
  return p.toString() ? `?${p}` : '';
}

async function raw(path: string, opts: Opts = {}): Promise<any> {
  const user = await getUser();
  const token = accessTokenOf(user);
  if (!token) throw new ApiError(401, 'not_authenticated', 'Sign in first.');
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (opts.networkId) headers['X-Network-Id'] = opts.networkId;
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${config.cpmsApiBase}/cpms/v1${path}${qstr(opts.query)}`, {
    method: opts.method ?? 'GET', headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let json: any; try { json = text ? JSON.parse(text) : undefined; } catch { json = undefined; }
  if (!res.ok) throw new ApiError(res.status, json?.error ?? json?.code ?? `http_${res.status}`, json?.message ?? json?.hint ?? (text || res.statusText));
  return json;
}
async function get<T>(p: string, o: Opts = {}): Promise<T> { const j = await raw(p, o); return (j && typeof j === 'object' && 'data' in j) ? j.data as T : j as T; }
async function list<T>(p: string, o: Opts = {}): Promise<Paged<T>> { const j = await raw(p, o); if (Array.isArray(j)) return { data: j }; return { data: (j?.data ?? []) as T[], pagination: j?.pagination }; }

/** Download a CSV/blob endpoint (e.g. exports) and trigger a browser save. */
async function download(path: string, filename: string, o: Opts = {}) {
  const user = await getUser(); const token = accessTokenOf(user);
  if (!token) throw new ApiError(401, 'not_authenticated', 'Sign in first.');
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (o.networkId) headers['X-Network-Id'] = o.networkId;
  const res = await fetch(`${config.cpmsApiBase}/cpms/v1${path}${qstr(o.query)}`, { headers });
  if (!res.ok) throw new ApiError(res.status, `http_${res.status}`, res.statusText);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
}

export const api = {
  download,
  // context
  me: () => get<Context>('/me'),
  networks: () => list<NetworkSummary>('/networks'),
  usage: (n: string, days = 30) => get<any>('/usage', { networkId: n, query: { days } }),

  // chargers + lifecycle
  chargers: (n: string, q?: Record<string, string | number | undefined>) => list<ChargerSummary>('/chargers', { networkId: n, query: q }),
  charger: (n: string, id: string) => get<ChargerDetail>(`/chargers/${id}`, { networkId: n }),
  createCharger: (n: string, body: unknown) => get<any>('/chargers', { networkId: n, method: 'POST', body }),
  updateCharger: (n: string, id: string, body: unknown) => get<any>(`/chargers/${id}`, { networkId: n, method: 'PATCH', body }),
  deleteCharger: (n: string, id: string) => raw(`/chargers/${id}`, { networkId: n, method: 'DELETE' }),
  // connectors
  connectorStatus: (n: string, id: string) => get<ConnectorSummary & { chargerOnline: boolean }>(`/connectors/${id}/status`, { networkId: n }),
  addConnector: (n: string, chargerId: string, body: unknown) => get<any>(`/chargers/${chargerId}/connectors`, { networkId: n, method: 'POST', body }),
  updateConnector: (n: string, id: string, body: unknown) => get<any>(`/connectors/${id}`, { networkId: n, method: 'PUT', body }),
  deleteConnector: (n: string, id: string) => raw(`/connectors/${id}`, { networkId: n, method: 'DELETE' }),
  // charger reads
  chargerConfig: (n: string, id: string) => get<any>(`/chargers/${id}/configuration`, { networkId: n }),
  setConfig: (n: string, id: string, body: unknown) => raw(`/chargers/${id}/configuration`, { networkId: n, method: 'POST', body }),
  chargerCommands: (n: string, id: string) => list<ChargerCommand>(`/chargers/${id}/commands`, { networkId: n }),
  chargerProfiles: (n: string, id: string) => list<ChargingProfile>(`/chargers/${id}/charging-profiles`, { networkId: n }),
  deviceModel: (n: string, id: string) => list<DeviceModelVar>(`/chargers/${id}/device-model`, { networkId: n }),
  deviceModelReport: (n: string, id: string) => raw(`/chargers/${id}/device-model/report`, { networkId: n, method: 'POST', body: {} }),
  monitoringEvents: (n: string, id: string) => list<any>(`/chargers/${id}/monitoring/events`, { networkId: n }),
  setMonitoring: (n: string, id: string, body: unknown) => raw(`/chargers/${id}/monitoring/set`, { networkId: n, method: 'POST', body }),
  clearMonitoring: (n: string, id: string, monitorId: number) => raw(`/chargers/${id}/monitoring/${monitorId}`, { networkId: n, method: 'DELETE' }),
  displayMessages: (n: string, id: string) => list<any>(`/chargers/${id}/display-messages`, { networkId: n }),
  setDisplayMessage: (n: string, id: string, body: unknown) => raw(`/chargers/${id}/display-messages`, { networkId: n, method: 'POST', body }),
  clearDisplayMessage: (n: string, id: string, messageId: number) => raw(`/chargers/${id}/display-messages/${messageId}`, { networkId: n, method: 'DELETE' }),
  certificates: (n: string, id: string) => list<Certificate>(`/chargers/${id}/certificates`, { networkId: n }),
  diagnostics: (n: string, id: string) => get<any>(`/chargers/${id}/diagnostics`, { networkId: n }),
  diagnosticFiles: (n: string, id: string) => list<any>('/diagnostic-files', { networkId: n, query: { chargerId: id } }),
  fetchDiagnostics: (n: string, id: string, body: unknown = {}) => raw(`/chargers/${id}/diagnostics/fetch`, { networkId: n, method: 'POST', body }),
  firmwareStatus: (n: string, id: string) => get<any>(`/chargers/${id}/firmware/status`, { networkId: n }),
  firmwareCatalog: (n: string) => list<any>('/firmware', { networkId: n }),
  updateFirmware: (n: string, id: string, body: unknown) => raw(`/chargers/${id}/firmware/update`, { networkId: n, method: 'POST', body }),
  // live OCPP commands
  remoteStart: (n: string, id: string, body: unknown) => raw(`/chargers/${id}/remote-start`, { networkId: n, method: 'POST', body }),
  remoteStop: (n: string, id: string, body: unknown) => raw(`/chargers/${id}/remote-stop`, { networkId: n, method: 'POST', body }),
  reboot: (n: string, id: string, body: unknown) => raw(`/chargers/${id}/reboot`, { networkId: n, method: 'POST', body }),
  unlock: (n: string, id: string, body: unknown) => raw(`/chargers/${id}/unlock-connector`, { networkId: n, method: 'POST', body }),
  changeAvailability: (n: string, id: string, body: unknown) => raw(`/chargers/${id}/change-availability`, { networkId: n, method: 'POST', body }),
  triggerMessage: (n: string, id: string, body: unknown) => raw(`/chargers/${id}/trigger-message`, { networkId: n, method: 'POST', body }),
  // smart charging (per-connector cap)
  scLimit: (n: string, id: string) => get<any>(`/smart-charging/${id}/limit`, { networkId: n }),
  setScLimit: (n: string, id: string, body: unknown) => raw(`/smart-charging/${id}/limit`, { networkId: n, method: 'PUT', body }),
  clearScLimit: (n: string, id: string) => raw(`/smart-charging/${id}/limit`, { networkId: n, method: 'DELETE' }),

  // locations
  locations: (n: string) => list<LocationSummary>('/locations', { networkId: n }),
  location: (n: string, id: string) => get<LocationDetail>(`/locations/${id}`, { networkId: n }),
  createLocation: (n: string, body: unknown) => get<any>('/locations', { networkId: n, method: 'POST', body }),
  updateLocation: (n: string, id: string, body: unknown) => get<any>(`/locations/${id}`, { networkId: n, method: 'PUT', body }),
  deleteLocation: (n: string, id: string) => raw(`/locations/${id}`, { networkId: n, method: 'DELETE' }),
  // load balancing (keyed by location/station id)
  loadBalancing: (n: string, id: string) => get<LoadBalancing>(`/load-balancing/${id}`, { networkId: n }),
  updateLoadBalancing: (n: string, id: string, body: unknown) => raw(`/load-balancing/${id}`, { networkId: n, method: 'PUT', body }),
  rebalance: (n: string, id: string) => raw(`/load-balancing/${id}/rebalance`, { networkId: n, method: 'POST', body: {} }),

  // sessions
  sessions: (n: string, q?: Record<string, string | number | undefined>) => list<SessionSummary>('/sessions', { networkId: n, query: q }),
  session: (n: string, id: string) => get<SessionDetail>(`/sessions/${id}`, { networkId: n }),
  meterValues: (n: string, id: string) => get<MeterValue[]>(`/sessions/${id}/meter-values`, { networkId: n }).then((d) => (Array.isArray(d) ? d : [])),
  sessionEvents: (n: string, id: string) => list<SessionEvent>(`/sessions/${id}/events`, { networkId: n }),
  forceStop: (n: string, id: string, body: unknown = {}) => raw(`/sessions/${id}/force-stop`, { networkId: n, method: 'POST', body }),
  refund: (n: string, id: string, body: unknown) => raw(`/sessions/${id}/refund`, { networkId: n, method: 'POST', body }),
  waiveIdleFee: (n: string, id: string, body: unknown) => raw(`/sessions/${id}/waive-idle-fee`, { networkId: n, method: 'POST', body }),

  // tariffs
  tariffs: (n: string) => list<TariffSummary>('/tariffs', { networkId: n }),
  tariff: (n: string, id: string) => get<TariffDetail>(`/tariffs/${id}`, { networkId: n }),
  createTariff: (n: string, body: unknown) => get<any>('/tariffs', { networkId: n, method: 'POST', body }),
  updateTariff: (n: string, id: string, body: unknown) => get<any>(`/tariffs/${id}`, { networkId: n, method: 'PUT', body }),
  deleteTariff: (n: string, id: string) => raw(`/tariffs/${id}`, { networkId: n, method: 'DELETE' }),
  tariffAssignments: (n: string, id: string) => list<TariffAssignment>(`/tariffs/${id}/assignments`, { networkId: n }),
  assignTariff: (n: string, id: string, body: unknown) => raw(`/tariffs/${id}/assign`, { networkId: n, method: 'POST', body }),
  detachAssignment: (n: string, assignmentId: string) => raw(`/tariffs/assignments/${assignmentId}`, { networkId: n, method: 'DELETE' }),

  // transactions / cdrs
  transactions: (n: string, q?: Record<string, string | number | undefined>) => list<TxSummary>('/transactions', { networkId: n, query: q }),
  transaction: (n: string, id: string) => get<any>(`/transactions/${id}`, { networkId: n }),
  exportTransactions: (n: string, q?: Record<string, string | number | undefined>) => download('/transactions/export', `cdrs-${Date.now()}.csv`, { networkId: n, query: q }),

  // analytics
  kpis: (n: string, q?: Record<string, string | undefined>) => get<Kpis>('/analytics/kpis', { networkId: n, query: q }),
  uptime: (n: string) => get<Uptime>('/analytics/uptime', { networkId: n }),
  revenue: (n: string, q?: Record<string, string | undefined>) => get<AnalyticsRollup>('/analytics/revenue', { networkId: n, query: q }),
  energy: (n: string, q?: Record<string, string | undefined>) => get<AnalyticsRollup>('/analytics/energy', { networkId: n, query: q }),
  sessionsRollup: (n: string, q?: Record<string, string | undefined>) => get<AnalyticsRollup>('/analytics/sessions', { networkId: n, query: q }),
  utilization: (n: string) => get<AnalyticsRollup>('/analytics/utilization', { networkId: n }),
  exportReport: (n: string, type: string, q?: Record<string, string | undefined>) => download('/reports/export', `report-${type}-${Date.now()}.csv`, { networkId: n, query: { type, format: 'csv', ...(q ?? {}) } }),

  // webhooks
  webhooks: (n: string) => list<Webhook>('/webhooks', { networkId: n }),
  webhookEventTypes: (n: string) => get<any>('/webhooks/event-types', { networkId: n }),
  webhookDeliveries: (n: string, id: string) => list<WebhookDelivery>(`/webhooks/${id}/deliveries`, { networkId: n }),
  createWebhook: (n: string, body: unknown) => get<any>('/webhooks', { networkId: n, method: 'POST', body }),
  updateWebhook: (n: string, id: string, body: unknown) => raw(`/webhooks/${id}`, { networkId: n, method: 'PATCH', body }),
  deleteWebhook: (n: string, id: string) => raw(`/webhooks/${id}`, { networkId: n, method: 'DELETE' }),
  testWebhook: (n: string, id: string) => raw(`/webhooks/${id}/test`, { networkId: n, method: 'POST', body: {} }),
  retryDelivery: (n: string, id: string, deliveryId: string) => raw(`/webhooks/${id}/deliveries/${deliveryId}/retry`, { networkId: n, method: 'POST', body: {} }),

  // audit
  auditLog: (n: string, q?: Record<string, string | number | undefined>) => list<AuditEntry>('/audit-log', { networkId: n, query: q }),

  // limits
  limits: (n: string) => get<Limits>('/limits', { networkId: n }),
  setLimits: (n: string, body: unknown) => get<any>('/limits', { networkId: n, method: 'PUT', body }),
  requestIncrease: (n: string, body: unknown) => get<any>('/limits/increase-request', { networkId: n, method: 'POST', body }),
  increaseRequests: (n: string) => list<IncreaseRequest>('/limits/increase-requests', { networkId: n }),

  // wallet + fraud
  wallet: (n: string, driverId: string) => get<{ driverId: string; wallets: NetworkWallet[] }>(`/wallets/${driverId}`, { networkId: n }),
  creditWallet: (n: string, body: unknown) => get<any>('/wallets/credit', { networkId: n, method: 'POST', body }),
  fraudHolds: (n: string) => list<FraudHold>('/fraud/holds', { networkId: n }),
  fraudDriver: (n: string, driverId: string) => get<any>(`/fraud/drivers/${driverId}`, { networkId: n }),
  clearHold: (n: string, driverId: string, body: unknown) => raw(`/fraud/drivers/${driverId}/clear-hold`, { networkId: n, method: 'POST', body }),

  // org: settings / team / api-keys / catalog
  settings: (n: string) => get<Settings>('/settings', { networkId: n }),
  updateSettings: (n: string, body: unknown) => get<any>('/settings', { networkId: n, method: 'PUT', body }),
  team: (n: string) => list<TeamMember>('/team', { networkId: n }),
  addTeam: (n: string, body: unknown) => get<any>('/team', { networkId: n, method: 'POST', body }),
  updateTeam: (n: string, id: string, body: unknown) => raw(`/team/${id}`, { networkId: n, method: 'PUT', body }),
  removeTeam: (n: string, id: string) => raw(`/team/${id}`, { networkId: n, method: 'DELETE' }),
  apiKeys: (n: string) => list<ApiKey>('/api-keys', { networkId: n }),
  createApiKey: (n: string, body: unknown) => get<any>('/api-keys', { networkId: n, method: 'POST', body }),
  deleteApiKey: (n: string, id: string) => raw(`/api-keys/${id}`, { networkId: n, method: 'DELETE' }),
  manufacturers: (n: string) => list<Manufacturer>('/manufacturers', { networkId: n }),
  chargerModels: (n: string, q?: Record<string, string | undefined>) => list<ChargerModel>('/charger-models', { networkId: n, query: q }),

  // live events (SSE via fetch-stream — native EventSource can't set the bearer header)
  streamEvents: async (n: string, onEvent: (e: { type: string; data: any }) => void, signal: AbortSignal) => {
    const user = await getUser(); const token = accessTokenOf(user);
    if (!token) throw new ApiError(401, 'not_authenticated', 'Sign in first.');
    const res = await fetch(`${config.cpmsApiBase}/cpms/v1/events/stream`, {
      headers: { Authorization: `Bearer ${token}`, 'X-Network-Id': n, Accept: 'text/event-stream' }, signal,
    });
    if (!res.ok || !res.body) throw new ApiError(res.status, `http_${res.status}`, 'stream failed');
    const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = '';
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      const frames = buf.split('\n\n'); buf = frames.pop() ?? '';
      for (const fr of frames) {
        let type = 'message'; let data = '';
        for (const ln of fr.split('\n')) {
          if (ln.startsWith('event:')) type = ln.slice(6).trim();
          else if (ln.startsWith('data:')) data += ln.slice(5).trim();
        }
        if (type === 'keepalive' || !data) continue;
        try { onEvent({ type, data: JSON.parse(data) }); } catch { onEvent({ type, data }); }
      }
    }
  },
};

// formatters
export const f = (o: Record<string, unknown> | null | undefined, ...keys: string[]): string => {
  if (!o) return '—';
  for (const k of keys) { const v = o[k]; if (v !== undefined && v !== null && v !== '') return String(v); }
  return '—';
};
export const money = (v?: number | null, ccy = 'USD') => v === null || v === undefined ? '—' : new Intl.NumberFormat(undefined, { style: 'currency', currency: ccy || 'USD' }).format(v);
export const num = (v?: number | null, d = 2) => (v === null || v === undefined ? '—' : v.toFixed(d));
export const when = (v?: string | null) => (v ? new Date(v).toLocaleString() : '—');
export const ago = (v?: string | null) => {
  if (!v) return '—';
  const s = (Date.now() - new Date(v).getTime()) / 1000;
  if (s < 60) return `${Math.round(s)}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
};
export const dur = (a?: string | null, b?: string | null) => {
  if (!a) return '—';
  const m = Math.floor(((b ? new Date(b).getTime() : Date.now()) - new Date(a).getTime()) / 60000);
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
};
