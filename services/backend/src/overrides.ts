import type {
  ConditionalRule,
  GroupOverride,
  ItemOverride,
  Menu,
  MenuOverrides,
  PutOverridesRequest,
} from "@sf/contract";

/**
 * Merchant control-panel "menu overrides" store + apply step.
 *
 * Square is the source of truth for items, variations, prices, modifiers and
 * photos. This module stores OUR layer on top — the rules Square's API can't
 * express per modifier group (required/min/max, conditional reveal) plus
 * operational toggles (hide / sold-out / prep time). The control panel
 * (web UI, later) reads/writes this; the backend applies it to the live menu
 * AFTER fetchLiveMenu.
 *
 * DEV-ONLY backing: an in-memory document, exactly like store.ts. Production
 * swaps this for Workers KV / D1 by changing only the read/write functions —
 * everything else (applyOverrides) is pure and storage-agnostic.
 */

// ---------------------------------------------------------------------------
// Backing store (in-memory; swap for KV/D1 later — see store.ts conventions)
// ---------------------------------------------------------------------------

function emptyOverrides(): MenuOverrides {
  return { items: {}, deals: {}, updatedAt: new Date(0).toISOString() };
}

let current: MenuOverrides = emptyOverrides();

export const overridesStore = {
  /** Read the full overrides document. Always returns a value (empty if unset). */
  get(): MenuOverrides {
    return current;
  },

  /**
   * Replace the stored overrides with the given request. Returns the saved doc.
   * Keys are normalized so an `ItemOverride.itemId` always matches its map key.
   */
  put(req: PutOverridesRequest): MenuOverrides {
    const items: Record<string, ItemOverride> = {};
    for (const [key, ov] of Object.entries(req.items ?? {})) {
      items[key] = { ...ov, itemId: ov.itemId || key };
    }
    current = {
      items,
      deals: req.deals ?? {},
      updatedAt: new Date().toISOString(),
    };
    return current;
  },

  /** Test/dev reset. */
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
 * order-create time, not the menu. It is read from the override doc in orders.ts
 * (TODO) when that wiring lands.
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
