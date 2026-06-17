# Merchant Control Panel — Menu Overrides

> Orda-style admin layer that sits on TOP of Square. Square stays the source of
> truth for items, variations, prices, modifiers and photos. This layer stores
> only the rules Square's API can't express per modifier group plus operational
> toggles. Read `CLAUDE.md` (Deferred / roadmap) and `docs/SQUARE_INTEGRATION.md`
> first — those constraints are non-negotiable.

## Why this exists

Square's native modifier controls are limited. Today the owner sets what he can
in the Square dashboard, and the app papers over the gaps with a hard-coded
heuristic (in `apps/mobile/src/screens/ItemDetailScreen.tsx`, a "Choose your
drink" group is revealed by regex on `/drink/` + `/combo/`). That heuristic is
brittle. The durable fix is a small data layer the owner edits from a web panel,
which the backend applies to the live menu.

**Status: the web panel + admin login are now built and working** (see below).
Durable persistence (KV), prep-time → `pickup_at`, AND the mobile app reading
conditional overrides are all **done**. The regex heuristic is now only a
**fallback** — used solely when the owner has configured NO conditional rule on
an item. What remains is moving deals behind the overrides store.

## How the owner opens it (quick start)

1. Make sure the backend is running. Locally that is `npm run backend:dev`
   (wait for `Ready on http://localhost:8787`); in production it is the deployed
   Worker URL.
2. Open the panel in any browser at **`<backend-url>/admin`**
   (locally `http://localhost:8787/admin`).
3. Enter the **admin password** and click *Sign in*. The password is the
   `ADMIN_PASSWORD` secret (see below). The panel lists every menu item; expand
   one to set hide / sold-out / prep-time and per-group rules, then click
   **Save changes**.

### The admin password (`ADMIN_PASSWORD`)

- It is a **backend secret** — never shipped in the app, never committed.
- **Production:** set it once with
  `cd services/backend && npx wrangler secret put ADMIN_PASSWORD`.
- **Local dev:** add `ADMIN_PASSWORD=...` to `services/backend/.dev.vars`
  (gitignored), or leave it unset — when unset, the panel opens with **no
  password in sandbox/dev only** (and stays disabled in production). See
  `.dev.vars.example`.

## What's built

### Foundation (data layer)

- **Schema** (`contract/types.ts`): `MenuOverrides`, `ItemOverride`,
  `GroupOverride`, `ConditionalRule`, `DealOverride` (+ `PutOverridesRequest`),
  and matching OpenAPI schemas in `contract/openapi.yaml`.
- **Store** (`services/backend/src/overrides.ts`): `overridesStore` —
  `async get(env)` / `async put(env, req)` / `reset()`. **Persists in Workers KV
  when the `OVERRIDES` binding is present, else an in-memory document** (same
  convention as the `IDEMPOTENCY` KV in `webhook.ts`: prefer the binding, fall
  back to memory so local dev + tests need zero config). One JSON blob under the
  KV key `menu:overrides`. See "KV persistence (done)" below.
- **Apply step** (`services/backend/src/overrides.ts`): `applyOverrides(menu,
  overrides)` — pure, non-mutating; runs in `menu.ts getMenu()` AFTER
  `fetchLiveMenu`. So overrides never become a competing source of items/prices.

### Admin auth (done)

- `POST /admin/login` (`services/backend/src/admin.ts`) checks the
  `ADMIN_PASSWORD` secret (constant-time compare) and returns a short-lived
  (8 h) **admin JWT** with `typ: "admin"`. It reuses the SAME `signJwt` /
  `verifyJwt` HS256 helpers + `JWT_SIGNING_SECRET` as customer auth (now
  exported from `auth.ts`) — no duplicated crypto.
- `GET` / `PUT /admin/overrides` require that admin JWT
  (`Authorization: Bearer …`). A customer access token can't satisfy them
  (different `typ`) and vice-versa.
- **Fallback for local dev:** when `ADMIN_PASSWORD` is unset, the endpoints keep
  the original open gate — usable in sandbox/dev, hard-blocked (403) in
  production. So local work needs no password; production needs the secret.

### Web dashboard (done)

- **`services/backend/public/admin.html`** — a single self-contained file
  (vanilla HTML + CSS + `fetch()`, no build step). It prompts for the password
  → `POST /admin/login` → stores the token → loads `GET /menu` and
  `GET /admin/overrides`, and renders every item grouped by category. Per item:
  toggle hidden / sold-out and set prep-time minutes. Per modifier group:
  required / optional, min, max, and "conditional (hidden until triggered)" with
  trigger group + trigger modifier pickers. **Save changes** PUTs the cleaned
  `MenuOverrides` document. Clear save confirmation + inline errors; warns on
  unsaved-changes navigation.
- **Serving:** `GET /admin` returns the HTML inline. The file is bundled as a
  text module via the `[[rules]] type = "Text"` entry in `wrangler.toml` and
  `import adminHtml from "../public/admin.html"` in `index.ts`
  (typed by `src/html.d.ts`). Works in `wrangler dev` and `wrangler deploy` with
  no extra toolchain.

### KV persistence (done)

Overrides now survive Worker restarts/redeploys. `overridesStore.get(env)` /
`put(env, req)` read/write **Workers KV when the `OVERRIDES` binding is present**,
and fall back to the in-memory document when it is not — the exact convention the
`IDEMPOTENCY` KV uses in `webhook.ts`. The whole document is stored as one JSON
blob under the KV key `menu:overrides`.

- **Local dev/tests:** with no binding, the store stays in memory (zero config).
  Under `wrangler dev` the binding (once added) resolves to a **simulated KV**, so
  saved overrides persist locally too (in `.wrangler/`).
- **Production:** create the namespace once, then uncomment the `[[kv_namespaces]]`
  block for `OVERRIDES` in `wrangler.toml` with the returned id:
  ```sh
  cd services/backend && npx wrangler kv namespace create OVERRIDES
  ```
  `env.ts` already declares the optional `OVERRIDES?: KVNamespace` binding;
  `applyOverrides` is storage-agnostic, so nothing else changed.

### Prep time → `pickup_at` (done)

The per-item `prepTimeMinutes` override now drives the Square PICKUP fulfillment's
ready time. At order-create (`orders.ts`, LIVE mode only): `pickup_at = now +
max(DEFAULT_PREP_MINUTES, max prepTimeMinutes across the ordered items)`, where
`DEFAULT_PREP_MINUTES = 10`. `overrides.ts` exposes the pure helper
`maxPrepTimeMinutes(overrides, itemIds)`. `square.ts createSquareOrder` takes an
optional `pickupAt?` ISO string: when present it sends `pickup_details.pickup_at`
(a SCHEDULED pickup); when absent it keeps `schedule_type: "ASAP"` (Square forbids
sending both). Mock mode is unaffected (it never calls Square).

### What each field does

Per ITEM (keyed by Square ITEM id):

| Field | Effect |
|---|---|
| `hidden` | Item dropped from the menu entirely. |
| `soldOut` | `available` forced false (we only ever take availability away; Square Inventory still wins when it already marked sold out). |
| `prepTimeMinutes` | NOT applied to the menu. Feeds the Square order `pickup_at` at order-create time (wired — see "Prep time → `pickup_at` (done)"). |
| `groups[]` | Per modifier-group overrides (below). |

Per modifier GROUP (keyed by Square MODIFIER_LIST id):

| Field | Effect |
|---|---|
| `required` | Force required (min≥1) / optional (min 0). |
| `minSelections` / `maxSelections` | Clamp the group's min/max (e.g. bread = pick exactly 1). Explicit values win over `required`. |
| `conditional` | A `ConditionalRule` — the group only shows once a trigger modifier in another group is selected. |

### The conditional-modifier bridge (regex → data) — DONE, regex now a fallback

`ConditionalRule` is the data shape that drives the combo→drink behavior the app
used to do with regex:

```ts
conditional: {
  hiddenUntilTriggered: true,
  triggerModifierIds: ["<square id of the 'Make it a combo' modifier>"],
  // or triggerGroupIds: ["<combo group id>"]  // any selection in that group
}
```

This is now a **real contract field** — `ModifierGroup.conditional?` (additive,
optional, in `contract/types.ts` + `openapi.yaml`). `applyOverrides` writes the
panel's `ConditionalRule` straight onto `group.conditional` (the old
`__conditional` local field is retired). The mobile app **prefers this data**:

- `ItemDetailScreen` checks whether ANY group on the item carries
  `conditional.hiddenUntilTriggered`. If so, visibility + auto-reveal are driven
  entirely from the rule (`triggerModifierIds` / `triggerGroupIds`, or — when both
  are empty — any selection in a non-conditional group).
- When NO group has conditional data, it falls back to the legacy
  `/drink/` + `/combo/` regex heuristic, so items the owner hasn't configured
  behave exactly as before. The regex is now strictly a fallback.

To make a combo data-driven: open the panel, mark the drink group "conditional"
and pick the trigger group/modifier, Save. The app reveals that group from the
rule; the regex is no longer consulted for that item.

## What remains to build

~~KV / D1 persistence~~, ~~Prep time → `pickup_at`~~, and ~~mobile reads
conditional overrides / regex retired (with fallback)~~ are now **done** — see
"KV persistence (done)", "Prep time → `pickup_at` (done)", and the bridge section
above. Still open:

1. **Deals into the panel** — `DealOverride` is a stub. Move the hard-coded deals
   in `menu.ts getDeals()` behind the overrides store so the owner edits them.
   (The panel currently edits items/groups only.)

## Endpoints

| Method | Path | Auth | Body | Returns |
|---|---|---|---|---|
| GET | `/admin` | — | — | control-panel HTML page |
| POST | `/admin/login` | — | `{ password }` | `{ token, expiresIn }` |
| GET | `/admin/overrides` | admin JWT | — | `MenuOverrides` |
| PUT | `/admin/overrides` | admin JWT | `PutOverridesRequest` | saved `MenuOverrides` |

When `ADMIN_PASSWORD` is set, the overrides routes require the admin JWT
(`401` without it). When it is unset they fall back to the dev/sandbox open gate
(and `403` in production). `POST /admin/login` returns `401` on a wrong password.
`PUT` returns `422` on a malformed body.

### Example `PUT /admin/overrides`

```json
{
  "items": {
    "ITEM_CORNED_BEEF": {
      "itemId": "ITEM_CORNED_BEEF",
      "prepTimeMinutes": 12,
      "groups": [
        { "groupId": "MODLIST_BREAD", "required": true, "minSelections": 1, "maxSelections": 1 },
        {
          "groupId": "MODLIST_DRINK",
          "conditional": {
            "hiddenUntilTriggered": true,
            "triggerModifierIds": ["MOD_MAKE_IT_A_COMBO"]
          }
        }
      ]
    },
    "ITEM_SEASONAL_WRAP": { "itemId": "ITEM_SEASONAL_WRAP", "hidden": true }
  }
}
```
