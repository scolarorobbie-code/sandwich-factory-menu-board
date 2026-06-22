/**
 * palette.ts — the brand COLOR palette, extracted VERBATIM from brand.ts.
 *
 * WHY THIS FILE EXISTS: `brand.ts` also owns the logo asset, which it pulls in
 * with `require("../assets/logo.png")` at module load. That native asset
 * `require` can't be evaluated outside the Expo/Metro bundler (e.g. in a plain
 * Node/vitest run). The pure color data, however, is just a frozen object.
 *
 * Extracting the palette into this RN-free module lets `theme.ts` derive its
 * `colors` from it AND lets unit tests import it without dragging in the asset
 * require. `brand.ts` re-exports `palette` / `Palette` from here, so every
 * existing `import { palette } from "./brand"` keeps working unchanged — the
 * object identity and values are IDENTICAL to before.
 *
 * REPLACE the hex values when real brand colors land, but KEEP THE KEYS —
 * theme.ts maps these 1:1 into the `colors` object that every screen imports,
 * so the keys are a contract. Do not rename them.
 */
export const palette = {
  bg: "#0e0a08", // app background — warm near-black (brown/red undertone)
  bg2: "#17100d", // raised surfaces: headers, tab bar, pill bar
  card: "#201712", // cards / secondary buttons (warm charcoal)
  line: "rgba(244,236,215,0.10)", // cream-tinted hairline borders / dividers
  accent: "#c0392b", // SANDWICH FACTORY brand red (from the logo) — CTAs, cart bar
  accent2: "#e0a33c", // warm golden (toasted-bread highlight) — prices, headings, active pills
  text: "#f4ecd7", // warm cream (the logo cream) — primary text on dark
  muted: "#b7a892", // warm taupe — secondary / muted text
  cyan: "#7fc8c0", // sparing cool accent (hints), warmed to sit with the brand
} as const;

export type Palette = typeof palette;
