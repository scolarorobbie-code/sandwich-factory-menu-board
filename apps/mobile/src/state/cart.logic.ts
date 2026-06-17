/**
 * cart.logic.ts — the PURE cart math, extracted VERBATIM from cart.tsx.
 *
 * WHY THIS FILE EXISTS: `cart.tsx` is a React context provider — it imports
 * `react`, so it can't be imported in a plain Node/vitest run. The price math
 * here, however, is pure (no React, no React Native). Extracting it lets unit
 * tests import the math directly while `cart.tsx` re-exports these same symbols,
 * so every existing `import { entryTotal } from "../state/cart"` keeps working
 * unchanged — the definitions are IDENTICAL to before.
 */
import type { MenuVariation, Modifier } from "@sf/contract";

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
