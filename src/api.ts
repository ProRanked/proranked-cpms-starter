import { config } from './config';
import { getUser, accessTokenOf } from './auth';
import type {
  Context, NetworkSummary, ChargerSummary, ChargerDetail, ConnectorSummary, SessionSummary, SessionDetail,
  MeterValue, SessionEvent, LocationSummary, LocationDetail, TariffSummary, TariffDetail, TariffAssignment,
  TxSummary, Kpis, Uptime, AnalyticsRollup, ChargerCommand, DeviceModelVar, Certificate, ChargingProfile,
  Webhook, WebhookDelivery, AuditEntry, Limits, Paged,
} from './types';

// Thin client for the public ProRanked CPMS API (/api/cpms/v1), called DIRECTLY from the browser with the
// operator's bearer token + X-Network-Id. No backend, no secret. Handles both server envelopes:
//   single: {data, success, timestamp}     list: {data, pagination?, count?, success, timestamp}

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

type Opts = { networkId?: string; method?: string; body?: unknown; query?: Record<string, string | number | undefined> };

async function raw(path: string, opts: Opts = {}): Promise<{ json: any; res: Response }> {
  const user = await getUser();
  const token = accessTokenOf(user);
  if (!token) throw new ApiError(401, 'not_authenticated', 'Sign in first.');

  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (opts.networkId) headers['X-Network-Id'] = opts.networkId;
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';

  let qs = '';
  if (opts.query) {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(opts.query)) if (v !== undefined && v !== '') p.set(k, String(v));
    qs = p.toString() ? `?${p}` : '';
  }

  const res = await fetch(`${config.cpmsApiBase}/api/cpms/v1${path}${qs}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let json: any;
  try { json = text ? JSON.parse(text) : undefined; } catch { json = undefined; }
  if (!res.ok) {
    throw new ApiError(res.status, json?.error ?? json?.code ?? `http_${res.status}`, json?.message ?? json?.hint ?? (text || res.statusText));
  }
  return { json, res };
}

// unwrap single {data} → T (or the body if not enveloped)
async function get<T>(path: string, opts: Opts = {}): Promise<T> {
  const { json } = await raw(path, opts);
  return (json && typeof json === 'object' && 'data' in json) ? (json.data as T) : (json as T);
}
// list → {data, pagination}
async function list<T>(path: string, opts: Opts = {}): Promise<Paged<T>> {
  const { json } = await raw(path, opts);
  if (Array.isArray(json)) return { data: json };
  return { data: (json?.data ?? []) as T[], pagination: json?.pagination };
}

export const api = {
  // context
  me: () => get<Context>('/me'),
  networks: () => list<NetworkSummary>('/networks'),
  usage: (n: string, days = 30) => get<any>('/usage', { networkId: n, query: { days } }),
  limits: (n: string) => get<Limits>('/limits', { networkId: n }),

  // chargers
  chargers: (n: string, q?: Record<string, string | number | undefined>) => list<ChargerSummary>('/chargers', { networkId: n, query: q }),
  charger: (n: string, uuid: string) => get<ChargerDetail>(`/chargers/${uuid}`, { networkId: n }),
  connectorStatus: (n: string, uuid: string) => get<ConnectorSummary & { chargerOnline: boolean }>(`/connectors/${uuid}/status`, { networkId: n }),
  chargerConfig: (n: string, uuid: string) => get<any>(`/chargers/${uuid}/configuration`, { networkId: n }),
  chargerCommands: (n: string, uuid: string) => list<ChargerCommand>(`/chargers/${uuid}/commands`, { networkId: n }),
  chargerProfiles: (n: string, uuid: string) => list<ChargingProfile>(`/chargers/${uuid}/charging-profiles`, { networkId: n }),
  deviceModel: (n: string, uuid: string) => list<DeviceModelVar>(`/chargers/${uuid}/device-model`, { networkId: n }),
  monitoringEvents: (n: string, uuid: string) => list<any>(`/chargers/${uuid}/monitoring/events`, { networkId: n }),
  certificates: (n: string, uuid: string) => list<Certificate>(`/chargers/${uuid}/certificates`, { networkId: n }),
  diagnostics: (n: string, uuid: string) => get<any>(`/chargers/${uuid}/diagnostics`, { networkId: n }),
  firmwareStatus: (n: string, uuid: string) => get<any>(`/chargers/${uuid}/firmware/status`, { networkId: n }),
  // charger commands (live OCPP — operator action)
  remoteStart: (n: string, uuid: string, body: unknown) => raw(`/chargers/${uuid}/remote-start`, { networkId: n, method: 'POST', body }),
  remoteStop: (n: string, uuid: string, body: unknown) => raw(`/chargers/${uuid}/remote-stop`, { networkId: n, method: 'POST', body }),
  reboot: (n: string, uuid: string, body: unknown) => raw(`/chargers/${uuid}/reboot`, { networkId: n, method: 'POST', body }),
  unlock: (n: string, uuid: string, body: unknown) => raw(`/chargers/${uuid}/unlock-connector`, { networkId: n, method: 'POST', body }),
  changeAvailability: (n: string, uuid: string, body: unknown) => raw(`/chargers/${uuid}/change-availability`, { networkId: n, method: 'POST', body }),
  triggerMessage: (n: string, uuid: string, body: unknown) => raw(`/chargers/${uuid}/trigger-message`, { networkId: n, method: 'POST', body }),

  // locations
  locations: (n: string) => list<LocationSummary>('/locations', { networkId: n }),
  location: (n: string, id: string) => get<LocationDetail>(`/locations/${id}`, { networkId: n }),

  // sessions
  sessions: (n: string, q?: Record<string, string | number | undefined>) => list<SessionSummary>('/sessions', { networkId: n, query: q }),
  session: (n: string, id: string) => get<SessionDetail>(`/sessions/${id}`, { networkId: n }),
  meterValues: (n: string, id: string) => get<MeterValue[]>(`/sessions/${id}/meter-values`, { networkId: n }).then((d) => (Array.isArray(d) ? d : [])),
  sessionEvents: (n: string, id: string) => list<SessionEvent>(`/sessions/${id}/events`, { networkId: n }),
  forceStop: (n: string, id: string, body: unknown) => raw(`/sessions/${id}/force-stop`, { networkId: n, method: 'POST', body }),
  refund: (n: string, id: string, body: unknown) => raw(`/sessions/${id}/refund`, { networkId: n, method: 'POST', body }),

  // tariffs
  tariffs: (n: string) => list<TariffSummary>('/tariffs', { networkId: n }),
  tariff: (n: string, id: string) => get<TariffDetail>(`/tariffs/${id}`, { networkId: n }),
  tariffAssignments: (n: string, id: string) => list<TariffAssignment>(`/tariffs/${id}/assignments`, { networkId: n }),

  // transactions / cdrs
  transactions: (n: string, q?: Record<string, string | number | undefined>) => list<TxSummary>('/transactions', { networkId: n, query: q }),
  transaction: (n: string, id: string) => get<any>(`/transactions/${id}`, { networkId: n }),

  // analytics
  kpis: (n: string, q?: Record<string, string | undefined>) => get<Kpis>('/analytics/kpis', { networkId: n, query: q }),
  uptime: (n: string) => get<Uptime>('/analytics/uptime', { networkId: n }),
  revenue: (n: string, q?: Record<string, string | undefined>) => get<AnalyticsRollup>('/analytics/revenue', { networkId: n, query: q }),
  energy: (n: string, q?: Record<string, string | undefined>) => get<AnalyticsRollup>('/analytics/energy', { networkId: n, query: q }),
  sessionsRollup: (n: string, q?: Record<string, string | undefined>) => get<AnalyticsRollup>('/analytics/sessions', { networkId: n, query: q }),
  utilization: (n: string) => get<AnalyticsRollup>('/analytics/utilization', { networkId: n }),

  // webhooks
  webhooks: (n: string) => list<Webhook>('/webhooks', { networkId: n }),
  webhookEventTypes: (n: string) => get<any>('/webhooks/event-types', { networkId: n }),
  webhookDeliveries: (n: string, id: string) => list<WebhookDelivery>(`/webhooks/${id}/deliveries`, { networkId: n }),
  createWebhook: (n: string, body: unknown) => raw('/webhooks', { networkId: n, method: 'POST', body }),
  deleteWebhook: (n: string, id: string) => raw(`/webhooks/${id}`, { networkId: n, method: 'DELETE' }),
  testWebhook: (n: string, id: string) => raw(`/webhooks/${id}/test`, { networkId: n, method: 'POST' }),

  // audit
  auditLog: (n: string, q?: Record<string, string | number | undefined>) => list<AuditEntry>('/audit-log', { networkId: n, query: q }),
};

// Render helpers for loosely-typed rows.
export const f = (o: Record<string, unknown> | null | undefined, ...keys: string[]): string => {
  if (!o) return '—';
  for (const k of keys) { const v = o[k]; if (v !== undefined && v !== null && v !== '') return String(v); }
  return '—';
};
export const money = (v?: number | null, ccy = 'USD') =>
  v === null || v === undefined ? '—' : new Intl.NumberFormat(undefined, { style: 'currency', currency: ccy || 'USD' }).format(v);
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
  const ms = (b ? new Date(b).getTime() : Date.now()) - new Date(a).getTime();
  const m = Math.floor(ms / 60000);
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
};
