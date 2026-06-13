import type { Money } from "@sf/contract";

// Brand palette lifted from the in-store menu boards (tv-*.html).
export const colors = {
  bg: "#0a0a0c",
  bg2: "#15110f",
  card: "#1c1815",
  line: "rgba(255,255,255,0.08)",
  accent: "#ff5b35",
  accent2: "#ffb238",
  text: "#f4f1ee",
  muted: "#b8b2ac",
  cyan: "#7fd6e0",
};

export const money = (m: Money) => `$${(m.amount / 100).toFixed(2)}`;
export const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;
