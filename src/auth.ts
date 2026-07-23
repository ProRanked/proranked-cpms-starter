import { UserManager, WebStorageStateStore, type User } from 'oidc-client-ts';
import { config } from './config';

// Browser-side OAuth 2.1 Auth Code + PKCE against ProRanked Identity. No client secret (public client),
// no backend. The resulting role-scoped operator access token is sent straight to /cpms/v1.
//
// RFC 8707 resource: we request the CPMS resource so Identity mints a token whose `aud` matches CPO's
// CpmsResourceServer — that per-family audience binding is what stops an eMSP/driver token being replayed
// against the operator API (and vice-versa).
const origin = window.location.origin;

export const userManager = new UserManager({
  authority: config.oidcAuthority,
  client_id: config.oidcClientId,
  redirect_uri: `${origin}/auth/callback`,
  post_logout_redirect_uri: origin,
  response_type: 'code',
  scope: config.oidcScopes,
  // Pass the RFC 8707 resource so the access token is audience-bound to the CPMS API.
  extraQueryParams: { resource: config.oidcResource },
  extraTokenParams: { resource: config.oidcResource },
  // Tokens live in sessionStorage (cleared on tab close); state in sessionStorage too.
  userStore: new WebStorageStateStore({ store: window.sessionStorage }),
  automaticSilentRenew: true,
  monitorSession: false,
});

export const login = () => userManager.signinRedirect();
export const logout = () => userManager.signoutRedirect();
export const completeLogin = () => userManager.signinRedirectCallback();
export const getUser = () => userManager.getUser();

export function accessTokenOf(user: User | null): string | null {
  return user && !user.expired ? user.access_token : null;
}

/** Decode the (unverified, display-only) JWT payload so the UI can show aud/scopes for the demo. */
export function decodeJwt(token: string): Record<string, unknown> | null {
  try {
    const [, payload] = token.split('.');
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return null;
  }
}
