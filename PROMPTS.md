# Prompts — build your operator console with an AI agent

Copy a prompt, paste it into **Claude Code** (or Cursor / any coding agent) inside this repo, and
edit the bracketed bits. Every prompt assumes you've done the [README](./README.md) quickstart, so
the app runs and you can sign in as an operator.

> **Claude Code, not chat artifacts.** Artifacts run under a content-security policy that blocks
> `api.proranked.com`, so an artifact can only mock this API. Use artifacts to explore a *look*; use
> Claude Code to build the real thing.

---

## 1 · Re-brand this console as your own

The highest-value first move — a complete, working operator console in your colours.

```
Re-brand this console for [YOUR BRAND].

Brand: [YOUR BRAND]
Primary colour: [#HEX]   Accent: [#HEX]
Feel: [e.g. dense and technical / calm and spacious]

Read CLAUDE.md first. Do it through src/tokens.ts, src/index.css and the shared kit in
src/components/ui.tsx — NOT by editing colours page by page. Replace the wordmark, app
title, and any placeholder branding. Keep every API call and page behaviour as-is.

Then run the dev server and tell me which files to touch for further tweaks.
```

## 2 · Cut it down to the pages you actually need

This starter ships every CPMS vertical. Most operators want a fraction of it.

```
Trim this console to just: [e.g. Dashboard, Chargers, Sessions, Tariffs].

Remove the other pages and their nav entries, and delete any now-unused components —
but do NOT touch src/api.ts (I want the full client available for later).

Make sure the build passes and there are no dead imports or broken routes.
```

## 3 · Add a page

```
Add a [DESCRIBE THE PAGE] to this console.

Use the existing client in src/api.ts — find the method that already covers it; only add
one if the endpoint genuinely isn't in the OpenAPI spec, and check GAP-ANALYSIS.md before
concluding it's missing.

Match the existing pages for layout, loading, empty and error states, and use the shared
kit in src/components/ui.tsx. Remember an empty list is a valid response on a new network.
```

## 4 · Live charger control (read the warning)

```
Add remote start / stop / reboot controls for a charger to the charger detail page.

IMPORTANT: these need the `cpms:command:chargers` scope, which is ELEVATED and NOT in the
default operator set — and CPO further intersects scopes with the signed-in operator's role
(only Admin/Owner gets command:*). So:

1. Call GET /cpms/v1/me first and read `scopes`.
2. If cpms:command:chargers is absent, render the controls DISABLED with an explanation of
   why — do not hide them silently and do not fake a success response.
3. Only wire the real calls when the scope is present.

I'd rather see an honest disabled button than a button that 403s.
```

## 5 · Webhooks for session events

```
Add a webhooks page: list, create, delete subscriptions, and show recent deliveries.

Two things that will bite you:
- Fetch the event-type list from the API at runtime. Do NOT hardcode names — some published
  examples show `session.completed`, which does not exist. The real session events are
  charging.session.started / .stopped / .updated.
- On create, `events` is a COMMA-SEPARATED STRING, not an array.

The signing secret is returned once on create — show it once, clearly, and never again.
```

---

## Writing your own prompts

What makes these work:

- **Name the exact endpoints and scopes.** Agents invent plausible-but-wrong ones when guessing.
- **Say "don't mock."** Left unsaid, a blocked agent fakes data to look finished.
- **Point at `CLAUDE.md`, `GAP-ANALYSIS.md` and the OpenAPI spec** instead of re-explaining the API.
- **Describe the failure you expect** (403 on elevated scopes, empty lists on a new network) so the
  agent handles it instead of "fixing" it.
