# Working in this repo (contract for coding agents)

This is a **backend-less EV-charging operator console** on the ProRanked **CPMS API**. The browser
signs the operator in with OAuth 2.1 + PKCE and calls the public API directly with a role-scoped
operator token. **There is no server and no client secret** — don't add one unless asked.

It's a starter: someone forked it to ship their own branded console. Most tasks are re-skinning,
adding a page, or wiring an endpoint — not rebuilding.

## The API

```
Base URL   https://api.proranked.com
Paths      /cpms/v1/...          <- there is NO /api prefix
Auth       Authorization: Bearer <operator token>   (OAuth, not an API key)
Tenancy    X-Network-Id: <network uuid>
```

Config is in `public/config.js` (runtime, overwritable without a rebuild) with `.env` `VITE_*`
fallbacks — see `.env.example`. The OAuth client is **public/PKCE**: `oidcClientId` is not a secret.

## Before deploying anywhere but localhost

This app derives `redirect_uri` from `window.location.origin`. The default `VITE_OIDC_CLIENT_ID`
(`proranked-cpms-spa`) is a **shared reference client with fixed redirect URIs**, so any other origin
fails login with `invalid_request` / ID2043 — *"The specified 'redirect_uri' is not valid for this
client application."*

The fix is not to edit the auth code. Register the deployment's own client:
**app.proranked.com → Settings → OAuth clients → Register** (redirect `https://HOST/auth/callback`,
post-logout `https://HOST`, app origin `https://HOST`), then set the returned `pr_spa_…` id as
`VITE_OIDC_CLIENT_ID`. Allow ~60s before the first login — the new client propagates to the auth
servers on a timer, and until it does you'll be sent to the driver login instead of the operator one.

## The two things that will waste your session

**1. Requesting a scope does not grant it.** The app asks for the full `cpms:*` set, but CPO
re-intersects the token with the signed-in operator's **role** on the target network:

| Role | Effective |
|---|---|
| Viewer / unknown | `cpms:read:*` only |
| Operator | `+ cpms:write:*` |
| Admin / Owner | `+ cpms:command:*` |

So a Viewer gets 403 on writes no matter what the config requests. That is correct behaviour — not
a bug, and not something to work around by editing scopes.

**2. `cpms:command:chargers` is an *elevated* scope**, deliberately excluded from the default
operator set. Remote **start / stop / reboot / unlock** need it. A console built with default scopes
will render a working-looking "Start charging" button that **403s at runtime**.

Check what you actually have before building UI that depends on it:

```
GET /cpms/v1/me   ->  { data: { accessibleNetworkCount, keyType, scopes: [...] } }
```

Degrade the UI when a scope is absent (disable + explain). **Never fake the response.**

## The client is the API reference

`src/api.ts` is the whole `/cpms/v1` client — one method per endpoint, plus envelope handling,
`X-Network-Id` tenancy, CSV download and SSE-over-fetch helpers. Before adding a call:

1. Look in `src/api.ts` — it's probably there.
2. Else check <https://docs.proranked.com/specs/openapi-cpms.json>.
3. Else check **[GAP-ANALYSIS.md](./GAP-ANALYSIS.md)** — it lists what the public API genuinely does
   *not* expose (gateways, driver roster, RFID tokens, alert rules). If it's there, say so and stop.

Do not invent endpoints.

## Response shapes

```jsonc
{ "data": …, "success": true, "timestamp": "…" }     // + "pagination" on lists
{ "error": "not_found", "code": "not_found", "message": "…" }   // errors
```

**An empty `data: []` is a success.** A new network has no chargers, sessions or locations, so most
lists legitimately return `[]`. It looks identical to a broken credential — use `/cpms/v1/me`, which
always returns content, to tell the difference. Don't start mocking because a list came back empty.

## Webhooks (if you touch them)

- Event names are `charging.session.started` / `.stopped` / `.updated`, `connector.status_changed`,
  `charger.online|offline|error`, `payment.succeeded|failed`. **There is no `session.completed`**,
  despite some published examples showing it — subscribing to that name silently receives nothing.
  Fetch the live list rather than hardcoding.
- On create, `events` is a **comma-separated string**, not an array.

## Re-branding (the most common task)

- `src/tokens.ts` + `src/index.css` — colours, fonts, radii. **Change these first.**
- `src/components/ui.tsx` — the shared kit (Card, Table, StatCard, Modal, Btn…). Re-skin once here
  and every page follows.
- `src/components/charts.tsx` — dependency-free inline-SVG charts.

If you're editing colours inside individual pages, you're doing it the hard way.

## Rules

- **Never mock the API or invent fixture data.** On a 401/403/404, stop and report the exact status
  and body — a 403 usually means role or elevated scope, and that's information the human needs.
- Keep it backend-less. No server, no client secret.
- Don't restructure or swap frameworks unless asked.
- Anything not covered here: <https://docs.proranked.com/specs/llms.txt>
