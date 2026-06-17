/**
 * brand.ts — THE SINGLE SOURCE OF TRUTH FOR SANDWICH FACTORY BRANDING.
 *
 * Everything visual that identifies the brand — the color palette, the name,
 * the tagline, and the logo asset — lives HERE and nowhere else. `theme.ts`
 * derives its `colors` export from this file, so screens never import brand
 * values directly; they keep importing `colors` from `theme.ts` exactly as
 * before.
 *
 * WHY THIS FILE EXISTS: the owner (Scolaro Enterprises) still owes us the real
 * logo file and brand colors (see docs/WEB_SOCIAL_AUDIT.md §4 and STATUS.md).
 * The current palette is a premium dark theme lifted from the in-store digital
 * menu boards (tv-*.html) — it is a PLACEHOLDER default, not a final brand.
 * When the real assets arrive, swapping them in should be a near drop-in here.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ▼▼▼ REPLACE THESE WHEN THE OWNER SENDS REAL COLORS / LOGO ▼▼▼
 *
 *  1. COLORS — replace the hex values in `palette` below with the official
 *     brand colors (or colors sampled from the real logo + storefront photo).
 *     Keep the SAME KEYS so theme.ts and every screen keep working untouched.
 *
 *  2. LOGO — drop the real logo PNG into apps/mobile/assets/ (see docs/BRANDING.md
 *     for required files + sizes), then set `logo.image` to:
 *         image: require("../assets/logo.png")
 *     and flip `logo.hasImage` to `true`. Until then Brandmark renders the
 *     text wordmark and `logo.image` stays null.
 *
 *  3. TAGLINE / NAME — confirm `tagline` with the owner (he may want a shorter
 *     line than the website title). `name` is unlikely to change.
 *
 * ▲▲▲ END REPLACE SECTION ▲▲▲
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
 * Logo asset slot.
 *
 * There is NO logo file yet (the website + socials are bot-blocked, so we
 * couldn't pull one — see audit §4). Until the owner sends one:
 *   - `image` stays `null`
 *   - `hasImage` stays `false`
 *   - Brandmark.tsx renders the styled text wordmark instead of an <Image>
 *
 * TO ADD THE REAL LOGO (drop-in): place the file at apps/mobile/assets/logo.png
 * then change the two fields below — Brandmark switches to the image with no
 * other edits required.
 */
export const logo = {
  /** Set to `require("../assets/logo.png")` once the asset exists. */
  image: null as number | null,
  /** Flip to `true` when `image` points at a real asset. */
  hasImage: false,
  /** Accessible label for the logo / wordmark. */
  accessibilityLabel: `${name} logo`,
};

// ── Color palette ────────────────────────────────────────────────────────────

/**
 * PLACEHOLDER premium dark palette — moved here VERBATIM from theme.ts (values
 * originally lifted from the in-store menu boards, tv-*.html). These are the
 * default until the owner's real brand colors arrive.
 *
 * REPLACE the hex values when real colors land, but KEEP THE KEYS — theme.ts
 * maps these 1:1 into the `colors` object that every screen imports, so the
 * keys are a contract. Do not rename them.
 */
export const palette = {
  bg: "#0a0a0c", // app background (near-black)
  bg2: "#15110f", // raised surfaces: headers, tab bar, pill bar
  card: "#1c1815", // cards / secondary buttons
  line: "rgba(255,255,255,0.08)", // hairline borders / dividers
  accent: "#ff5b35", // primary brand orange (CTAs, cart bar)
  accent2: "#ffb238", // warm amber accent (prices, headings, active pills)
  text: "#f4f1ee", // primary text on dark
  muted: "#b8b2ac", // secondary / muted text
  cyan: "#7fd6e0", // sparing cool accent (hints)
} as const;

export type Palette = typeof palette;
