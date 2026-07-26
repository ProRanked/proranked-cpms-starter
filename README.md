# ProRanked CPMS Console — Starter

A **complete, backend-less** EV-charging operator console built directly on the **ProRanked CPMS API**
(`/cpms/v1`). The browser signs the operator in with **OAuth 2.1 Auth Code + PKCE** and calls the public API
**directly** with a **role-scoped operator token** — no server to run, no secret to hold.

> **Use this as a starting point.** Fork it, drop your own design from Lovable / Claude-design on top of the
> shared component kit, point it at your network, ship it. It's a pure static SPA (Vite + React + Tailwind),
> zero runtime deps beyond `react`, `react-router`, `oidc-client-ts`.

## What's inside (every public CPMS vertical)

| Area | Pages |
|---|---|
| Overview | **Dashboard** (fleet donut, KPIs, recent sessions) · **Analytics** (revenue/energy/sessions/utilization + CSV export) |
| Charge points | **Locations** (CRUD + load-balancing panel) · **Chargers** (list + **Add**) · **Charger detail** (Overview/Connectors[+CRUD]/Configuration[+edit]/Commands/Charging Profiles/Device Model[+report]/Monitoring[+set/clear]/Display messages/Firmware[+apply]/Certificates/Diagnostics[+fetch] + live OCPP actions + per-connector charge cap + edit/delete) · **Sessions** (filters/export/create) · **Session detail** (power+current+voltage+SoC curves, timeline, refund/force-stop/waive) · **Tariffs** (CRUD + assign/detach) · **Transactions/CDRs** (filters/export/refund) |
| Drivers & billing | **Wallets** (credit + balance) · **Fraud holds** (release/waive) |
| Platform | **Webhooks** (CRUD + HMAC + retry) · **Live events** (SSE) · **Audit log** (server-side filters) · **Limits** (set caps + increase requests) |
| Organization | **Settings** · **Team** · **API keys** · **Hardware catalog** |

See **[GAP-ANALYSIS.md](./GAP-ANALYSIS.md)** for exactly what the public `/cpms/v1` API does and doesn't expose
(the few genuine API gaps — gateways, driver roster, RFID tokens, alert rules — are flagged there).

## Architecture (built to fork)

- **`src/api.ts`** — the entire `/cpms/v1` client (one method per endpoint), `X-Network-Id` tenancy, envelope
  handling, CSV download + SSE-via-fetch helpers. **This is your contract with the API.**
- **`src/hooks.ts`** — `useResource(fn, deps, enabled)` → `{data, loading, error, reload}`. Every page uses it;
  no react-query needed.
- **`src/components/ui.tsx`** — the shared kit (Card, Table, StatCard, Tabs, Modal, Btn, Select, Input, Notice,
  StatusPill…). **Re-skin here once and every page changes.**
- **`src/components/charts.tsx`** — dependency-free inline-SVG charts (Area/Bar/Donut/LineCurve).
- **`src/tokens.ts` + `src/index.css`** — design tokens (brand colour, ink, status colours, fonts).
  Change the brand in **three** places, all adjacent: `tokens.brand` / `tokens.brandDim` in `tokens.ts`,
  the `--color-brand-*` ramp in the `@theme` block, and `--brand-rgb` in that same block (the RGB
  channels the page gradients, glow shadow and scrollbar tint with — a hex var can't be alpha-composited,
  which is why this one is separate). Charts read `tokens.ts`, so they follow automatically.
  Don't forget the favicon data-URI in `index.html` and the `<title>`.
- **`src/auth.ts` + `src/config.ts`** — PKCE auth + runtime/build-time config.

## Building with an AI agent

- **[PROMPTS.md](./PROMPTS.md)** — copy-paste prompts (re-brand, trim to the pages you need, add a
  page, live charger control, webhooks) for Claude Code or Cursor.
- **[CLAUDE.md](./CLAUDE.md)** — the contract an agent should read first: base URL, how scopes get
  intersected with the operator's role, which scopes are elevated, and what *not* to do.
  Auto-loaded by Claude Code.

## Re-skin in Lovable / Claude-design

1. Keep `src/api.ts` + `src/hooks.ts` as-is (they're your data layer).
2. Restyle `src/components/ui.tsx` (or replace the primitives with your generated components — keep the prop
   shapes) and edit `src/index.css` + `src/tokens.ts` for colors/fonts.
3. Each page is a thin composition of `useResource` + UI primitives — paste a page into Claude-design with the
   ui kit and ask it to restyle; the data wiring stays.

## Quick start

```bash
cp .env.example .env        # defaults target the ProRanked lab
npm install && npm run dev   # http://localhost:5175
```

Your Identity client (`proranked-cpms-spa`) must allow `http://localhost:5175/auth/callback`.

## Configure

Runtime (`public/config.js`, overrideable per-deploy without rebuild) or build-time (`.env` / `VITE_*`):

| Setting | Lab | Prod |
|---|---|---|
| `oidcAuthority` | `https://id-lab.phevnix.cloud` | `https://id.proranked.com` |
| `cpmsApiBase` | `https://cpo.phevnix.cloud` | `https://api.proranked.com` |
| `oidcResource` | `https://api.phevnix.cloud/cpms/v1` | `https://api.proranked.com/cpms/v1` |
| `oidcClientId` | `proranked-cpms-spa` | `proranked-cpms-spa` |
| `oidcScopes` | the full operator set (CPO re-intersects with role) — trim to least-privilege in your fork |

## Deploy (k3s example)

```bash
docker build -t ghcr.io/proranked/proranked-cpms-starter:latest-arm64 .
docker push ghcr.io/proranked/proranked-cpms-starter:latest-arm64
kubectl apply -f k8s/dev/
```

MIT licensed. Built by ProRanked.
