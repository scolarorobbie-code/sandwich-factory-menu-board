import type { CartLineItem, Menu, MenuItem, Order, OrderLineItem } from "@sf/contract";

/**
 * One-tap reorder bridge.
 *
 * When the order carries a `cartLineItems` snapshot (all orders placed after
 * June 2026) we validate each line against the CURRENT menu for availability
 * and silently drop anything that's been removed or sold out, but we keep the
 * exact catalog ids — no name-matching needed.
 *
 * For older orders without the snapshot we fall back to resolving display names
 * back to ids against the current menu. Anything that can't be matched
 * (item renamed/removed, variation gone, modifier dropped) is skipped.
 */

const norm = (s: string) => s.trim().toLowerCase();

function findItemById(menu: Menu, itemId: string): MenuItem | undefined {
  for (const c of menu.categories) {
    const found = c.items.find((i) => i.id === itemId);
    if (found) return found;
  }
  return undefined;
}

function findItemByName(menu: Menu, name: string): MenuItem | undefined {
  const target = norm(name);
  for (const c of menu.categories) {
    const found = c.items.find((i) => norm(i.name) === target);
    if (found) return found;
  }
  return undefined;
}

/**
 * Validate a snapshotted CartLineItem against the live menu.
 * Returns null if the item/variation is gone or unavailable.
 * Silently drops modifiers that are no longer in the catalog.
 */
function validateCartLine(menu: Menu, line: CartLineItem): CartLineItem | null {
  const item = findItemById(menu, line.itemId);
  if (!item || !item.available) return null;

  const variation = item.variations.find((v) => v.id === line.variationId);
  if (!variation || !variation.available) return null;

  const allMods = item.modifierGroups.flatMap((g) => g.modifiers);
  const modifierIds = line.modifierIds.filter(
    (id) => allMods.some((m) => m.id === id && m.available),
  );

  return { ...line, modifierIds };
}

/** Resolve a single historical order line into a cart line item, or null. */
function resolveLine(menu: Menu, line: OrderLineItem): CartLineItem | null {
  const item = findItemByName(menu, line.name);
  if (!item || !item.available) return null;

  const variation =
    item.variations.find((v) => norm(v.name) === norm(line.variationName)) ??
    // Single-variation items often carry a generic/blank variation name.
    (item.variations.length === 1 ? item.variations[0] : undefined);
  if (!variation || !variation.available) return null;

  const allMods = item.modifierGroups.flatMap((g) => g.modifiers);
  const modifierIds = line.modifiers
    .map((m) => allMods.find((x) => norm(x.name) === norm(m.name) && x.available)?.id)
    .filter((id): id is string => !!id);

  return {
    itemId: item.id,
    variationId: variation.id,
    quantity: Math.max(1, Math.floor(line.quantity)),
    modifierIds,
    note: line.note,
  };
}

export interface ReorderPlan {
  lineItems: CartLineItem[];
  /** Lines that couldn't be matched / validated against the current menu. */
  skipped: number;
  total: number;
}

/** Map a past order's line items back to cart line items against the live menu. */
export function planReorder(menu: Menu, order: Order): ReorderPlan {
  if (order.cartLineItems?.length) {
    const lineItems = order.cartLineItems
      .map((l) => validateCartLine(menu, l))
      .filter((l): l is CartLineItem => l !== null);
    return { lineItems, skipped: order.cartLineItems.length - lineItems.length, total: order.cartLineItems.length };
  }

  // Legacy path: resolve display names back to catalog ids.
  const lineItems = order.lineItems
    .map((l) => resolveLine(menu, l))
    .filter((l): l is CartLineItem => l !== null);
  return { lineItems, skipped: order.lineItems.length - lineItems.length, total: order.lineItems.length };
}
