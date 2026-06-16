# Merchant Control Panel — Menu Overrides (foundation)

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
which the backend applies to the live menu. This commit builds the FOUNDATION of
that layer — the data model, the apply step, and the admin API — not the UI.

## What's built (this foundation)

- **Schema** (`contract/types.ts`): `MenuOverrides`, `ItemOverride`,
  `GroupOverride`, `ConditionalRule`, `DealOverride` (+ `PutOverridesRequest`),
  and matching OpenAPI schemas in `contract/openapi.yaml`.
- **Store** (`services/backend/src/overrides.ts`): `overridesStore` — an
  in-memory document with `get()` / `put()` / `reset()`, following the same
  dev-only pattern as `store.ts`. Swappable for Workers KV / D1 by changing only
  those functions.
- **Apply step** (`services/backend/src/overrides.ts`): `applyOverrides(menu,
  overrides)` — pure, non-mutating; runs in `menu.ts getMenu()` AFTER
  `fetchLiveMenu`. So overrides never become a competing source of items/prices.
- **Admin API** (`services/backend/src/admin.ts`, wired in `index.ts`):
  `GET /admin/overrides` and `PUT /admin/overrides`.

### What each field does

Per ITEM (keyed by Square ITEM id):

| Field | Effect |
|---|---|
| `hidden` | Item dropped from the menu entirely. |
| `soldOut` | `available` forced false (we only ever take availability away; Square Inventory still wins when it already marked sold out). |
| `prepTimeMinutes` | NOT applied to the menu. Reserved to feed Square order `pickup_at` at order-create time (TODO in `orders.ts`). |
| `groups[]` | Per modifier-group overrides (below). |

Per modifier GROUP (keyed by Square MODIFIER_LIST id):

| Field | Effect |
|---|---|
| `required` | Force required (min≥1) / optional (min 0). |
| `minSelections` / `maxSelections` | Clamp the group's min/max (e.g. bread = pick exactly 1). Explicit values win over `required`. |
| `conditional` | A `ConditionalRule` — the group only shows once a trigger modifier in another group is selected. |

### The conditional-modifier bridge (regex → data)

`ConditionalRule` is the data shape that can eventually drive the SAME combo→drink
behavior the app does with regex today:

```ts
conditional: {
  hiddenUntilTriggered: true,
  triggerModifierIds: ["<square id of the 'Make it a combo' modifier>"],
  // or triggerGroupIds: ["<combo group id>"]  // any selection in that group
}
```

`applyOverrides` attaches this to the group as an **additive** `__conditional`
field (typed locally in `overrides.ts`, intentionally NOT in the contract
`ModifierGroup` yet). The mobile app keeps its regex heuristic for now and
ignores the field. The migration is deliberate and reviewed:

1. Promote `__conditional` onto the contract `ModifierGroup` type.
2. Make `ItemDetailScreen` read `group.__conditional` when present, falling back
   to the regex heuristic when absent.
3. Author the real conditional rules in the panel, verify, then delete the regex.

## What remains to build

1. **Web UI** — the actual control panel the owner uses. A small admin SPA (or a
   page in an existing admin host) that: lists the live menu (`GET /menu`),
   shows per-item toggles (hide / sold-out / prep time) and per-group controls
   (required, min/max, "reveal only when …" conditional picker), then PUTs the
   whole `MenuOverrides` document. Keep it dumb: read menu, edit overrides, save.
2. **Admin auth** — `TODO(admin-auth)`. The endpoints are currently self-gated to
   dev/sandbox only (`adminAllowed()` returns false in production → 403). Before
   production they need a real admin identity, separate from customer JWTs: an
   admin role/token or a signed session for the owner's panel. This is the one
   hard blocker before the panel can go live.
3. **KV / D1 persistence** — replace the in-memory document in `overridesStore`
   with Workers KV (single JSON blob keyed e.g. `menu:overrides`) or D1. Only
   `get()` / `put()` change; `applyOverrides` is already storage-agnostic. Add
   the binding to `env.ts` + `wrangler.toml`.
4. **Mobile reads overrides** — the app already gets overridden min/max/hidden/
   sold-out transparently through `GET /menu` (applied server-side). The
   remaining work is consuming `__conditional` to replace the regex (see bridge
   above).
5. **Prep time → `pickup_at`** — read `prepTimeMinutes` in `orders.ts` /
   `square.ts createSquareOrder` and set the Square fulfillment `pickup_at`.
   (Tracks the existing TODO in `docs/SQUARE_INTEGRATION.md`.)
6. **Deals into the panel** — `DealOverride` is a stub. Move the hard-coded deals
   in `menu.ts getDeals()` behind the overrides store so the owner edits them.

## Endpoints

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/admin/overrides` | — | `MenuOverrides` |
| PUT | `/admin/overrides` | `PutOverridesRequest` | saved `MenuOverrides` |

Both return `403` in production until admin auth lands. `PUT` returns `422` on a
malformed body.

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
