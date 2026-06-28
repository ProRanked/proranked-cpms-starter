import { config } from './config';
import { getUser, accessTokenOf } from './auth';

// Thin client for the public ProRanked CPMS API (/api/cpms/v1), called DIRECTLY from the browser with the
// operator's bearer token. The selected network is sent as X-Network-Id (a UUID) — CPO scopes the request
// to exactly that network (an AllNetworks/operator caller must name one). No secret, no backend.

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

async function call<T>(path: string, opts: { networkId?: string; method?: string; body?: unknown } = {}): Promise<T> {
  const user = await getUser();
  const token = accessTokenOf(user);
  if (!token) throw new ApiError(401, 'not_authenticated', 'Sign in first.');

  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (opts.networkId) headers['X-Network-Id'] = opts.networkId;
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${config.cpmsApiBase}/api/cpms/v1${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  const text = await res.text();
  let parsed: unknown = undefined;
  try {
    parsed = text ? JSON.parse(text) : undefined;
  } catch {
    /* non-JSON */
  }

  if (!res.ok) {
    const p = parsed as { error?: string; code?: string; message?: string; hint?: string } | undefined;
    throw new ApiError(res.status, p?.error ?? p?.code ?? `http_${res.status}`, p?.message ?? p?.hint ?? (text || res.statusText));
  }

  // Unwrap the CPO {success,data} envelope when present.
  const env = parsed as { success?: boolean; data?: T } | undefined;
  if (env && typeof env === 'object' && 'success' in env && 'data' in env) return env.data as T;
  return parsed as T;
}

// ── Types (lenient — the API is the source of truth; these are display shapes) ────────────────────────
export interface NetworkInfo {
  id?: string;
  networkId?: string;
  uuid?: string;
  name?: string;
  role?: string;
  [k: string]: unknown;
}
export interface PagedResult<T> {
  data?: T[];
  items?: T[];
  totalCount?: number;
  page?: number;
  [k: string]: unknown;
}
export type Charger = Record<string, unknown>;
export type Session = Record<string, unknown>;

function rows<T>(r: PagedResult<T> | T[] | undefined): T[] {
  if (!r) return [];
  if (Array.isArray(r)) return r;
  return r.items ?? r.data ?? [];
}

export const api = {
  /** The signed-in operator + the networks they can act on (drives the network picker). */
  me: () => call<Record<string, unknown>>('/me'),
  networks: async (): Promise<NetworkInfo[]> => rows(await call<PagedResult<NetworkInfo>>('/networks')),
  chargers: async (networkId: string): Promise<Charger[]> => rows(await call<PagedResult<Charger>>('/chargers', { networkId })),
  sessions: async (networkId: string): Promise<Session[]> => rows(await call<PagedResult<Session>>('/sessions', { networkId })),
  analytics: (networkId: string) => call<Record<string, unknown>>('/analytics/summary', { networkId }),
  remoteStart: (networkId: string, chargerUuid: string, body: unknown) =>
    call<unknown>(`/chargers/${chargerUuid}/remote-start`, { networkId, method: 'POST', body }),
  remoteStop: (networkId: string, chargerUuid: string, body: unknown) =>
    call<unknown>(`/chargers/${chargerUuid}/remote-stop`, { networkId, method: 'POST', body }),
};

// Helpers for rendering loosely-typed rows.
export const field = (o: Record<string, unknown>, ...keys: string[]): string => {
  for (const k of keys) {
    const v = o[k];
    if (v !== undefined && v !== null && v !== '') return String(v);
  }
  return '—';
};
export const networkUuid = (n: NetworkInfo): string =>
  String(n.uuid ?? n.networkId ?? n.id ?? '');
