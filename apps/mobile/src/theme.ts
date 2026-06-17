import type { Money } from "@sf/contract";
import { palette } from "./brand";

// `colors` is DERIVED from the single brand source of truth (src/brand.ts).
// The object shape AND values are IDENTICAL to what they were before — every
// screen keeps importing `colors` from here, unchanged. To change brand colors,
// edit the `palette` in src/brand.ts, NOT this file.
export const colors = {
  bg: palette.bg,
  bg2: palette.bg2,
  card: palette.card,
  line: palette.line,
  accent: palette.accent,
  accent2: palette.accent2,
  text: palette.text,
  muted: palette.muted,
  cyan: palette.cyan,
};

export const money = (m: Money) => `$${(m.amount / 100).toFixed(2)}`;
export const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;
