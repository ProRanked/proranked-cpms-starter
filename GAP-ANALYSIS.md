# ProRanked CPMS Console — Gap Analysis (API vs Phevnix Portal vs this console)

**Date:** 2026-06-28 · **Method:** 6-agent 3-way comparison across every CPMS vertical — public `/cpms/v1` API
surface vs the Phevnix V2 operator Portal vs this starter console.

## Verdict

> **The limit is our implementation, not the API.** The public `/cpms/v1` API exposes ~112 endpoints; this
> console initially wired ~40 (mostly reads + 6 charger commands). The overwhelming majority of "missing"
> Portal capabilities are **impl-gaps** — the API already supports them, the console just hadn't built the UI.
> A small, well-defined set are genuine **API gaps** (the Portal does them via private/BFF endpoints that the
> public surface doesn't expose yet). Those are listed below for the API team.

Per-vertical verdict: chargers/OCPP = **implementation-limited**; locations/sessions = **implementation-limited**;
tariffs/transactions/analytics = **implementation-limited**; webhooks/audit/limits = **mostly implementation-limited**
(alerts are the exception); wallet/fraud = **implementation-limited**, drivers/tokens = **api-limited**;
org self-serve = **implementation-limited**, gateways/map = **api-limited**.

## Genuine API gaps (Portal does it; public `/cpms/v1` cannot)

These need a **CPO API change** before any public-API console can build them:

1. **Gateways** — no `/cpms/v1/gateways` surface at all (operator gateway lifecycle is private; WS6-deferred). Whole module.
2. **Drivers roster** — list/detail/create/update only on private `/api/private/v1/drivers`; no `cpms:*:drivers` scope. *This also blocks the wallet/fraud driver-picker* (those endpoints work but you can't discover driver UUIDs publicly). → expose at least `cpms:read:drivers` (search by email/uuid).
3. **RFID idTag tokens** — `cpms:read/write:tokens` are advertised and the scope middleware pre-registers `/api/cpms/v1/auth/tokens`, but **no endpoint is mounted** (token CRUD lives only on `/emsp/v1`). Mount it (or alias).
4. **Local authorization list** (`SendLocalList` / `GetLocalListVersion`) — not on `/cpms/v1` (Portal uses private). Pairs with tokens for offline RFID.
5. **Certificate install/sign + security events + ISO 15118 events** — public certs endpoint is read-only metadata; provisioning + security telemetry are private.
6. **Alerts family** — operator alert **inbox** (resolvable), alert **rules**, alert **channels** are all private Portal-only. (Webhooks + SSE are the public substitute for raw delivery, but not a persisted/resolvable alert inbox.) *Note: OCPP variable-monitoring ≠ network alert rules — don't conflate.*
7. **Network-wide OCPP defaults** + **OCPI roaming/party settings** — Portal exposes both under Settings via private/BFF; `/cpms/v1/settings` deliberately omits them.
8. **Location read omits `latitude`/`longitude`** — create/update accept them and the entity stores them, but `CpmsLocationSummary`/`CpmsLocationDetail` don't project them → **a map page can't get coordinates back.** *Trivial fix: add lat/lng (and ideally per-location charger count/status) to the read DTOs.*
9. **Per-charge receipt / invoice document** — CDR carries only scalar `invoiceNumber`/`invoiceDate`; no receipt/PDF/invoice object on CPMS (the Monta-parity receipt work landed on the eMSP/driver family).
10. **Analytics time-series is opaque** — `/analytics/{revenue,energy,sessions,utilization}` return a usable daily series but inside an untyped `networks[].rollup` bag with no OpenAPI inner schema (clients must probe field names). Top-level aggregates are typed. → expose a typed flat `{date,value}[]`.
11. **No historical-uptime time-series** — `/analytics/uptime` is a point-in-time snapshot only.

## Implementation gaps closed in this console (API was already there)

Charger CRUD + connector CRUD · OCPP config edit · charging-profile/smart-charging set/clear + per-connector cap ·
firmware apply + catalog · diagnostics fetch + files · variable-monitoring tab (events + set/clear) · display-messages
tab · device-model report · parameterized live-control commands · Locations CRUD · Load-balancing panel (read/edit/rebalance) ·
Sessions waive-idle-fee + create-session + CSV export + server-side filters + per-phase current/voltage/temp meter charts ·
Tariffs CRUD + assign/detach · Transactions filters + CSV export + refund-from-CDR · analytics utilization ·
webhooks create-fix + one-time HMAC reveal + edit/re-enable + delivery retry · live Events (SSE via fetch-stream) ·
audit-log server-side filters · Limits set-caps + increase-request + request list · Wallet (credit + balance) ·
Fraud holds (list + clear/waive) · Settings · Team · **API Keys** (the console's natural home) · hardware catalog.

> **Forkability note for vibe coders:** every page follows the same `useResource` hook + shared `ui.tsx` primitives +
> design tokens in `tokens.ts`/`index.css`, so re-skinning in Lovable/Claude-design is a one-place change. Each page's
> sub-header names the exact `/cpms/v1` endpoint it calls. See `README.md` for the page↔endpoint map + theming guide.
