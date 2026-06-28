// Resolve config from the runtime /config.js (window.PRORANKED_CONFIG) first, then the build-time VITE_* env.
// This lets one static image be re-pointed per deployment without a rebuild, while local dev uses .env.

declare global {
  interface Window {
    PRORANKED_CONFIG?: Partial<AppConfig>;
  }
}

export interface AppConfig {
  oidcAuthority: string;
  oidcClientId: string;
  oidcScopes: string;
  oidcResource: string;
  cpmsApiBase: string;
}

const rt = (typeof window !== 'undefined' && window.PRORANKED_CONFIG) || {};
const env = import.meta.env;

function pick(runtime: string | undefined, build: string | undefined, fallback = ''): string {
  return (runtime && runtime.trim()) || (build && build.trim()) || fallback;
}

export const config: AppConfig = {
  oidcAuthority: pick(rt.oidcAuthority, env.VITE_OIDC_AUTHORITY, 'https://id-lab.phevnix.cloud'),
  oidcClientId: pick(rt.oidcClientId, env.VITE_OIDC_CLIENT_ID, 'proranked-cpms-spa'),
  oidcScopes: pick(
    rt.oidcScopes,
    env.VITE_OIDC_SCOPES,
    'openid profile email offline_access cpms:read:chargers cpms:read:sessions cpms:write:chargers cpms:command:chargers',
  ),
  oidcResource: pick(rt.oidcResource, env.VITE_OIDC_RESOURCE, 'https://api.proranked.cloud/cpms/v1'),
  // '' = same-origin (Vite dev proxy). Otherwise the absolute CPO host (cross-origin → exercises CORS).
  cpmsApiBase: pick(rt.cpmsApiBase, env.VITE_CPMS_API_BASE, ''),
};
