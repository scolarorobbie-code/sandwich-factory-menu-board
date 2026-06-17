/**
 * brand.ts — THE SINGLE SOURCE OF TRUTH FOR SANDWICH FACTORY BRANDING.
 *
 * Everything visual that identifies the brand — the color palette, the name,
 * the tagline, and the logo asset — lives HERE and nowhere else. `theme.ts`
 * derives its `colors` export from this file, so screens never import brand
 * values directly; they keep importing `colors` from `theme.ts` exactly as
 * before.
 *
 * STATUS (2026-06-17): the owner sent the logo. The palette below is tuned to
 * the real brand colors (cream / brick-red / golden bread), and a faithful
 * in-brand RECREATION of the badge is wired as the app icon, splash, Android
 * adaptive icon, and in-app logo (apps/mobile/assets/). See docs/BRANDING.md.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * TO USE THE EXACT OFFICIAL LOGO (drop-in, no code change):
 *   Replace the five PNGs in apps/mobile/assets/ (logo / icon / adaptive-icon /
 *   splash / favicon) with the owner's official exports at the same sizes.
 *
 * TO ADJUST COLORS: edit the hex values in `palette` (now in ./palette.ts,
 *   re-exported below). KEEP THE KEYS — theme.ts maps them 1:1 into `colors`,
 *   which every screen imports, so the keys are a contract. Do not rename them.
 * ───────────────────────────────────────────────────────────────────────────
 */

// ── Identity ────────────────────────────────────────────────────────────────

/** Display name of the brand. Used by Brandmark and copy. */
export const name = "Sandwich Factory";

/**
 * Tagline from the website title (sandwichfactorytn.com), per the web/social
 * audit (docs/WEB_SOCIAL_AUDIT.md §4). UNCONFIRMED with owner — he may want a
 * shorter line. Replace here if so.
 */
export const tagline = "Burgers, Cuban Sandwiches, Italian Beef & Subs";

/** Year founded — locally owned since 2012 (web/social audit). */
export const foundedYear = 2012;

/**
 * Logo asset slot. A real badge asset is in place (apps/mobile/assets/logo.png),
 * so `hasImage` is true and Brandmark renders the <Image>. To use the owner's
 * exact logo, just replace the asset files — no change needed here.
 */
export const logo = {
  /**
   * The Sandwich Factory badge. This is a faithful in-brand RECREATION generated
   * from the owner's logo colors (cream disc, red rings, sandwich mark, wordmark,
   * "MURFREESBORO, TN · EST. 2012"). To use the EXACT logo file, replace the PNGs
   * in apps/mobile/assets/ (logo / icon / adaptive-icon / splash / favicon) with
   * the owner's official exports at the same sizes — nothing else changes.
   */
  image: require("../assets/logo.png") as number | null,
  /** True now that a real badge asset exists. */
  hasImage: true,
  /** Accessible label for the logo / wordmark. */
  accessibilityLabel: `${name} logo`,
  /** The badge is circular (square aspect) — Brandmark renders it square. */
  square: true,
};

// ── Color palette ────────────────────────────────────────────────────────────

/**
 * PLACEHOLDER premium dark palette. The hex values now live VERBATIM in the
 * sibling RN-free module `src/palette.ts` and are re-exported here, so every
 * existing `import { palette } from "./brand"` keeps working unchanged — same
 * object, same values. The split exists only so the palette can be imported
 * without evaluating this file's logo-asset `require` above (which resolves
 * only under the Expo/Metro bundler, not in a plain Node/vitest run).
 *
 * REPLACE the hex values when real colors land, but KEEP THE KEYS — theme.ts
 * maps these 1:1 into the `colors` object that every screen imports, so the
 * keys are a contract. Do not rename them.
 */
export { palette, type Palette } from "./palette";
