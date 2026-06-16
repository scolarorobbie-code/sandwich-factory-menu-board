import type { CartLineItem, Menu, MenuItem, MenuVariation, Modifier } from "@sf/contract";
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

/** A cart entry keeps display info alongside the ids the API needs. */
export interface CartEntry {
  key: string;
  itemName: string;
  variation: MenuVariation;
  modifiers: Modifier[];
  quantity: number;
  note?: string;
  /** ids for the API */
  itemId: string;
}

export function entryUnitPrice(e: CartEntry): number {
  return e.variation.price.amount + e.modifiers.reduce((s, m) => s + m.price.amount, 0);
}
export function entryTotal(e: CartEntry): number {
  return entryUnitPrice(e) * e.quantity;
}

/** Result of re-adding saved/historical line items against the current menu. */
export interface AddLineItemsResult {
  /** How many line items were successfully added to the cart. */
  added: number;
  /** How many were skipped because the item/variation no longer exists or is sold out. */
  skipped: number;
}

/**
 * Find a menu item by id (used to map a stored CartLineItem back to a full
 * MenuItem so it can re-enter the cart).
 */
function findMenuItem(menu: Menu, itemId: string): MenuItem | undefined {
  for (const c of menu.categories) {
    const found = c.items.find((i) => i.id === itemId);
    if (found) return found;
  }
  return undefined;
}

/**
 * Resolve a single stored CartLineItem against the live menu into a CartEntry.
 * Returns null when the item/variation is gone or unavailable. Missing
 * modifiers are dropped silently (the build is still valid without them).
 */
function resolveEntry(menu: Menu, line: CartLineItem): CartEntry | null {
  const item = findMenuItem(menu, line.itemId);
  if (!item || !item.available) return null;
  const variation = item.variations.find((v) => v.id === line.variationId);
  if (!variation || !variation.available) return null;

  const allMods = item.modifierGroups.flatMap((g) => g.modifiers);
  const modifiers = line.modifierIds
    .map((id) => allMods.find((m) => m.id === id))
    .filter((m): m is Modifier => !!m && m.available);

  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    itemId: item.id,
    itemName: item.name,
    variation,
    modifiers,
    quantity: Math.max(1, Math.floor(line.quantity)),
    note: line.note,
  };
}

interface CartState {
  entries: CartEntry[];
  count: number;
  subtotal: number;
  add: (item: MenuItem, variation: MenuVariation, modifiers: Modifier[], quantity: number, note?: string) => void;
  /**
   * Re-add saved/historical line items (e.g. one-tap reorder or a favorite),
   * resolving each against the live menu. Skips anything no longer available
   * and reports how many were added vs. skipped.
   */
  addLineItems: (menu: Menu, lineItems: CartLineItem[]) => AddLineItemsResult;
  remove: (key: string) => void;
  clear: () => void;
  toLineItems: () => CartLineItem[];
}

const CartContext = createContext<CartState | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<CartEntry[]>([]);

  const value = useMemo<CartState>(() => {
    const subtotal = entries.reduce((s, e) => s + entryTotal(e), 0);
    return {
      entries,
      count: entries.reduce((s, e) => s + e.quantity, 0),
      subtotal,
      add: (item, variation, modifiers, quantity, note) =>
        setEntries((prev) => [
          ...prev,
          {
            key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            itemId: item.id,
            itemName: item.name,
            variation,
            modifiers,
            quantity,
            note,
          },
        ]),
      addLineItems: (menu, lineItems) => {
        const resolved = lineItems
          .map((l) => resolveEntry(menu, l))
          .filter((e): e is CartEntry => e !== null);
        if (resolved.length) setEntries((prev) => [...prev, ...resolved]);
        return { added: resolved.length, skipped: lineItems.length - resolved.length };
      },
      remove: (key) => setEntries((prev) => prev.filter((e) => e.key !== key)),
      clear: () => setEntries([]),
      toLineItems: () =>
        entries.map((e) => ({
          itemId: e.itemId,
          variationId: e.variation.id,
          quantity: e.quantity,
          modifierIds: e.modifiers.map((m) => m.id),
          note: e.note,
        })),
    };
  }, [entries]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartState {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
