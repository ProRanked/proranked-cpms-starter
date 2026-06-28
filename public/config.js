// Runtime configuration — a hosted deployment overwrites this file (e.g. via a k8s ConfigMap mount) to
// point the same static image at its own Identity issuer + CPMS API, with NO rebuild. When absent/empty,
// the app falls back to the VITE_* values baked at build time (see .env.example).
//
// Defaults below target the ProRanked k3s-lab.
window.PRORANKED_CONFIG = {
  // ProRanked Identity (OAuth/OIDC issuer).
  oidcAuthority: 'https://id-lab.phevnix.cloud',
  // The public PKCE client id seeded in Identity (ClientSeeder: proranked-cpms-spa).
  oidcClientId: 'proranked-cpms-spa',
  // Space-delimited operator scopes. CPO re-intersects these with the operator's role, so requesting the
  // full set is safe (a Viewer still can't write).
  oidcScopes:
    'openid profile email offline_access cpms:read:chargers cpms:read:connectors cpms:read:locations cpms:read:tariffs cpms:read:sessions cpms:read:cdrs cpms:read:analytics cpms:read:settings cpms:read:webhooks cpms:read:events cpms:read:audit cpms:read:wallet cpms:write:chargers cpms:write:connectors cpms:write:locations cpms:write:tariffs cpms:write:settings cpms:write:webhooks cpms:write:team cpms:write:apikeys cpms:write:smartcharging cpms:write:loadbalancing cpms:write:firmware cpms:write:diagnostics cpms:write:wallet cpms:command:chargers cpms:command:billing',
  // The CPMS resource the token is minted for (RFC 8707 audience) — must match Identity's OperatorResource
  // and CPO's OAuth:Cpms:Audience exactly.
  oidcResource: 'https://api.proranked.cloud/cpms/v1',
  // Where the browser actually sends the calls (the CPO host serving /api/cpms/v1). Cross-origin → exercises
  // the SPA-bearer CORS policy. Empty string '' = same-origin (use the Vite dev proxy).
  cpmsApiBase: 'https://cpo.phevnix.cloud',
};
