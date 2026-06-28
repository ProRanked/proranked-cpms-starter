# ProRanked CPMS Console — Starter

A **backend-less** operator console built directly on the **ProRanked CPMS API** (`/cpms/v1`).

The browser signs the operator in with **OAuth 2.1 Auth Code + PKCE** against ProRanked Identity, then calls
the public CPMS API **directly** with the resulting **role-scoped operator token** — no server to run, no secret
to hold. This is the "Shape 2" pattern for teams (and vibecoders) who build a UI but don't want to operate a
backend.

> **Use this as a template.** Fork it, point it at your network, restyle it, ship it. Everything here is a pure
> static SPA — host it anywhere (a CDN, an object store, nginx, or k3s like the included manifests).

## How it works

```
 Browser SPA ──PKCE login──▶ id.proranked.com           (no secret; public client)
     │  ◀──── role-scoped operator JWT (aud = …/cpms/v1) ───┘
     │
     └── Authorization: Bearer <token> + X-Network-Id ──▶ api.proranked.com /cpms/v1   (CORS: SPA-bearer)
                                                              │
                                          CPO maps the token → operator tenancy + role-intersected scopes
```

- **No client secret** — public PKCE client (`proranked-cpms-spa`).
- **No backend** — the token lives in the browser (sessionStorage) and is sent straight to `/cpms/v1`.
- **Least privilege** — CPO re-intersects the token's scopes with the operator's actual role per network, so
  a Viewer can't write even if the token carries write scopes.

## Quick start (local)

```bash
cp .env.example .env       # edit if needed (defaults target the ProRanked lab)
npm install
npm run dev                # http://localhost:5175
```

Your Identity client (`proranked-cpms-spa`) must allow `http://localhost:5175/auth/callback` as a redirect URI.

## Configure

Two ways — pick one:

1. **Build-time** (`.env` / `VITE_*`): baked at `npm run build`. See `.env.example`.
2. **Runtime** (`public/config.js`): a hosted deployment overwrites `config.js` (e.g. a k8s ConfigMap mount) to
   re-point `oidcAuthority` / `oidcClientId` / `cpmsApiBase` / `oidcResource` **without rebuilding**.

| Setting | Lab | Prod |
|---|---|---|
| `oidcAuthority` | `https://id-lab.phevnix.cloud` | `https://id.proranked.com` |
| `cpmsApiBase` | `https://cpo.phevnix.cloud` | `https://api.proranked.com` |
| `oidcResource` | `https://api.proranked.cloud/cpms/v1` | `https://api.proranked.com/cpms/v1` |
| `oidcClientId` | `proranked-cpms-spa` | `proranked-cpms-spa` |

## Deploy (k3s example)

```bash
docker build -t ghcr.io/proranked/proranked-cpms-starter:latest-arm64 .
docker push ghcr.io/proranked/proranked-cpms-starter:latest-arm64
kubectl apply -f k8s/dev/
```

The included manifests serve the SPA via nginx and mount `config.js` from a ConfigMap so you re-point it without
a rebuild.

## What's inside

- `src/auth.ts` — `oidc-client-ts` UserManager (PKCE, RFC 8707 `resource`, silent renew).
- `src/api.ts` — the `/cpms/v1` client (Bearer + `X-Network-Id`, envelope-aware).
- `src/pages/` — Dashboard, Chargers, Sessions (read live data).
- A built-in **token inspector** (the "Token" button) shows the `aud`, `scope`, and `cnf` of your live token —
  handy for seeing exactly what the operator path grants.

MIT licensed. Built by ProRanked.
