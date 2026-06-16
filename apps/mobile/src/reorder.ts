import type { CartLineItem, Menu, MenuItem, Order, OrderLineItem } from "@sf/contract";

/**
 * One-tap reorder bridge.
 *
 * A past `Order` only stores DISPLAY data per line (item name, variation name,
 * modifier names) — not the Square catalog ids the cart/API need (the backend
 * doesn't snapshot the original cart; see services/backend/src/account.ts). To
 * reorder we resolve those names back to ids against the CURRENT menu, so the
 * rebuild always reflects today's catalog/prices (Square stays source of truth).
 *
 * Anything that can't be matched (item renamed/removed, variation gone, modifier
 * dropped) is skipped and counted so the UI can tell the customer.
 */

const norm = (s: string) => s.trim().toLowerCase();

function findItemByName(menu: Menu, name: string): MenuItem | undefined {
  const target = norm(name);
  for (const c of menu.categories) {
    const found = c.items.find((i) => norm(i.name) === target);
    if (found) return found;
  }
  return undefined;
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
  /** Lines that couldn't be matched to the current menu. */
  skipped: number;
  total: number;
}

/** Map a past order's line items back to cart line items against the live menu. */
export function planReorder(menu: Menu, order: Order): ReorderPlan {
  const lineItems = order.lineItems
    .map((l) => resolveLine(menu, l))
    .filter((l): l is CartLineItem => l !== null);
  return { lineItems, skipped: order.lineItems.length - lineItems.length, total: order.lineItems.length };
}
