import type { CartLineItem, MenuItem, MenuVariation, Modifier } from "@sf/contract";
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

interface CartState {
  entries: CartEntry[];
  count: number;
  subtotal: number;
  add: (item: MenuItem, variation: MenuVariation, modifiers: Modifier[], quantity: number, note?: string) => void;
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
