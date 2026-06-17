import type {
  ConditionalRule,
  GroupOverride,
  ItemOverride,
  Menu,
  MenuOverrides,
  PutOverridesRequest,
} from "@sf/contract";
import type { Env } from "./env";

/**
 * Merchant control-panel "menu overrides" store + apply step.
 *
 * Square is the source of truth for items, variations, prices, modifiers and
 * photos. This module stores OUR layer on top — the rules Square's API can't
 * express per modifier group (required/min/max, conditional reveal) plus
 * operational toggles (hide / sold-out / prep time). The control panel
 * (web UI) reads/writes this; the backend applies it to the live menu AFTER
 * fetchLiveMenu.
 *
 * BACKING STORE: durable in Workers KV when the `OVERRIDES` binding is present,
 * else an in-memory document. This follows the same convention as the
 * `IDEMPOTENCY` KV in webhook.ts — prefer the binding, fall back to an in-process
 * value when it is absent so local dev and tests work with zero config. (Local
 * `wrangler dev` supplies a simulated KV automatically, so persistence is
 * automatic there too.) `applyOverrides` stays pure + storage-agnostic.
 */

// ---------------------------------------------------------------------------
// Backing store — Workers KV when bound (env.OVERRIDES), else in-memory.
// Mirrors the IDEMPOTENCY pattern in webhook.ts.
// ---------------------------------------------------------------------------

/** Single KV key holding the whole overrides document as one JSON blob. */
const KV_KEY = "menu:overrides";

function emptyOverrides(): MenuOverrides {
  return { items: {}, deals: {}, updatedAt: new Date(0).toISOString() };
}

/** In-memory fallback document (used only when no KV binding is present). */
let current: MenuOverrides = emptyOverrides();

/** Normalize a PUT request into a stored doc (keys match `ItemOverride.itemId`). */
function normalize(req: PutOverridesRequest): MenuOverrides {
  const items: Record<string, ItemOverride> = {};
  for (const [key, ov] of Object.entries(req.items ?? {})) {
    items[key] = { ...ov, itemId: ov.itemId || key };
  }
  return {
    items,
    deals: req.deals ?? {},
    updatedAt: new Date().toISOString(),
  };
}

export const overridesStore = {
  /**
   * Read the full overrides document. Always returns a value (empty if unset).
   * Reads from KV when `env.OVERRIDES` is bound, else the in-memory fallback.
   */
  async get(env: Env): Promise<MenuOverrides> {
    if (!env.OVERRIDES) return current; // dev/test fallback
    const raw = await env.OVERRIDES.get(KV_KEY);
    if (!raw) return emptyOverrides();
    try {
      return JSON.parse(raw) as MenuOverrides;
    } catch {
      return emptyOverrides(); // corrupt blob: behave as if unset rather than throw
    }
  },

  /**
   * Replace the stored overrides with the given request. Returns the saved doc.
   * Persists to KV when bound (a single JSON blob), else updates memory. Keys are
   * normalized so an `ItemOverride.itemId` always matches its map key.
   */
  async put(env: Env, req: PutOverridesRequest): Promise<MenuOverrides> {
    const doc = normalize(req);
    if (env.OVERRIDES) {
      await env.OVERRIDES.put(KV_KEY, JSON.stringify(doc));
    } else {
      current = doc;
    }
    return doc;
  },

  /** Test/dev reset of the in-memory fallback. (No-op against KV.) */
  reset(): void {
    current = emptyOverrides();
  },
};

// ---------------------------------------------------------------------------
// Apply step (pure) — layer overrides on top of a live Square Menu
// ---------------------------------------------------------------------------

/**
 * Return a NEW Menu with overrides applied. Pure: does not mutate the input.
 *
 * - Hidden items are dropped from the menu entirely.
 * - Sold-out items have `available` forced false (Square Inventory still wins
 *   when it already marked something sold out — we only ever take availability
 *   away, never add it back).
 * - Per-group required/min/max are clamped onto the matching modifier group.
 * - Conditional rules are attached to the group via `__conditional` metadata so
 *   the app can eventually drive the combo→drink reveal from data instead of the
 *   regex heuristic. (Additive: the contract `ModifierGroup` is unchanged; the
 *   app reads this opt-in field when it's ready, ignores it until then.)
 *
 * `prepTimeMinutes` is NOT applied here — it feeds Square order `pickup_at` at
 * order-create time, not the menu. orders.ts reads it from the override doc via
 * `maxPrepTimeMinutes()` (below) to compute the PICKUP fulfillment's `pickup_at`.
 */
export function applyOverrides(menu: Menu, overrides: MenuOverrides): Menu {
  const itemOverrides = overrides.items;
  if (Object.keys(itemOverrides).length === 0) return menu;

  const categories = menu.categories.map((cat) => {
    const items = cat.items
      .filter((item) => !itemOverrides[item.id]?.hidden)
      .map((item) => {
        const ov = itemOverrides[item.id];
        if (!ov) return item;

        const groupOverrides = new Map<string, GroupOverride>(
          (ov.groups ?? []).map((g) => [g.groupId, g]),
        );

        const modifierGroups = item.modifierGroups.map((group) => {
          const go = groupOverrides.get(group.id);
          if (!go) return group;
          const min = go.minSelections ?? (go.required === true ? Math.max(1, group.minSelections) : go.required === false ? 0 : group.minSelections);
          const max = go.maxSelections ?? group.maxSelections;
          const next: ModifierGroupWithMeta = {
            ...group,
            minSelections: min,
            maxSelections: Math.max(max, min),
          };
          if (go.conditional) next.__conditional = go.conditional;
          return next;
        });

        return {
          ...item,
          available: item.available && !ov.soldOut,
          modifierGroups,
        };
      });
    return { ...cat, items };
  });

  return { ...menu, categories };
}

/**
 * The app-facing `ModifierGroup` plus the optional, additive conditional
 * metadata the override layer attaches. Declared here (not in the contract) so
 * the contract stays minimal until the app actually consumes it; when the app
 * reads it, promote `__conditional` into the contract `ModifierGroup`.
 */
type ModifierGroupWithMeta = Menu["categories"][number]["items"][number]["modifierGroups"][number] & {
  __conditional?: ConditionalRule;
};

// ---------------------------------------------------------------------------
// Prep time → Square order `pickup_at`
// ---------------------------------------------------------------------------

/**
 * Largest `prepTimeMinutes` override across the given Square ITEM ids, or 0 when
 * none of them carry a prep-time override. orders.ts uses this to set the PICKUP
 * fulfillment's `pickup_at = now + max(prep, default)`. Pure: takes the already-
 * loaded overrides doc (caller fetches it once via `overridesStore.get(env)`).
 */
export function maxPrepTimeMinutes(overrides: MenuOverrides, itemIds: Iterable<string>): number {
  let max = 0;
  for (const id of itemIds) {
    const minutes = overrides.items[id]?.prepTimeMinutes;
    if (typeof minutes === "number" && minutes > max) max = minutes;
  }
  return max;
}
