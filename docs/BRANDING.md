# Branding — what we need from the owner, and exactly where it plugs in

_Status: **APPLIED (2026-06-17).** The owner sent the logo. The app now uses the
real brand colors (cream `#f2e8cf` / brick-red `#c0392b` / golden bread) in
`apps/mobile/src/brand.ts`, and a faithful in-brand **recreation** of the badge
is wired as the app icon, splash, Android adaptive icon, and in-app header logo
(`apps/mobile/assets/`). The colors were sampled from the logo; the badge art is
a clean recreation (the exact PNG was sent in chat, not as a usable file)._

**To use the EXACT official logo (one step):** replace the five files in
`apps/mobile/assets/` with the owner's official exports at the same names/sizes —
`icon.png` (1024×1024 opaque square), `splash.png` (1024×1024, logo on
transparent), `adaptive-icon.png` (1024×1024 safe-zone, transparent),
`logo.png` (512×512 in-app), `favicon.png` (48×48). No code change needed.

---

## 1. What we still need from the owner

Please send these five things. Items **1 and 2** are the real blockers.

1. **The logo file.** Highest resolution you have.
   - **Best:** the original vector — `.ai`, `.svg`, or `.eps`. Vectors scale to
     any size with no blur.
   - **Also send:** a **PNG with a transparent background** (so it sits cleanly
     on our dark app). A version that reads well on **both light and dark**
     backgrounds is ideal.
2. **Brand colors.** The exact hex codes if you have them (or a brand/style
   sheet). If you don't know them, just say **"match the website/sign"** and
   we'll sample the colors from the logo + a storefront photo.
3. **Fonts.** The name of any font your logo or signage uses, if known.
   Otherwise we'll pick a close, premium match.
4. **2–3 photos of the storefront / sign.** These let us match the real-world
   brand colors even without a brand sheet.
5. **Confirm the tagline.** Is _"Burgers, Cuban Sandwiches, Italian Beef &
   Subs"_ the line you want in the app, or something shorter? (This is the
   website's current title line — unconfirmed with you.)

---

## 2. The image files we need, and their sizes

Drop these into **`apps/mobile/assets/`** (the folder does not exist yet —
create it). File names below match what the config expects.

| File | Size | Notes |
|---|---|---|
| `logo.png` | ~ height 88px+, transparent bg | In-app header wordmark/logo. Wide/landscape lockup works best in the top bar. |
| `icon.png` | **1024 × 1024** | App icon. **Opaque** (no transparency), square, **no pre-rounded corners** — Apple/Google round it for you. |
| `splash.png` | ~ 1200 × 1200 (logo centered) | Launch screen art. Sits on the `#15110f` background; keep it centered with breathing room. |
| `adaptive-icon.png` | **1024 × 1024**, transparent bg | Android adaptive icon foreground. Keep the logo within the centered "safe zone" — the OS crops the edges into circles/squircles. |

Vector source (`.svg`/`.ai`) is welcome too — we can regenerate any of the
above from it cleanly.

---

## 3. Where it all plugs in (for the developer)

Everything funnels through **one source-of-truth file** plus the asset folder.

### A. Colors + name + tagline + logo reference → `apps/mobile/src/brand.ts`

This is the **single source of truth**. Look for the clearly-marked
`▼▼▼ REPLACE THESE ▼▼▼` block.

- **Colors:** replace the hex values in `palette` with the real brand colors.
  **Keep the same keys** (`bg`, `bg2`, `card`, `line`, `accent`, `accent2`,
  `text`, `muted`, `cyan`) — `theme.ts` derives the app-wide `colors` object
  from them, so every screen updates automatically with zero screen edits.
- **Tagline / name:** update `tagline` (and `name` if ever needed).
- **Logo:** after adding `apps/mobile/assets/logo.png`, set in `brand.ts`:
  ```ts
  export const logo = {
    image: require("../assets/logo.png"),
    hasImage: true,
    accessibilityLabel: `${name} logo`,
  };
  ```
  The header component (`src/components/Brandmark.tsx`) then renders the real
  `<Image>` automatically — no edits to Brandmark or any screen.

### B. App icon / splash / Android adaptive icon → `apps/mobile/app.json`

After adding the asset files from §2, add these keys (full instructions are
also mirrored in `app.json` under `expo.extra.brandingTODO`):

```jsonc
{
  "expo": {
    "icon": "./assets/icon.png",
    "splash": {
      "image": "./assets/splash.png",
      "resizeMode": "contain",
      "backgroundColor": "#15110f"
    },
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#15110f"
      }
    }
  }
}
```

> ⚠️ **Do not add these keys before the files exist.** Pointing `icon` /
> `splash.image` / `adaptiveIcon` at a missing file **breaks EAS builds**. Until
> the assets land we intentionally use Expo's built-in defaults.

---

## 4. What's true today (placeholder state)

- **Palette:** a premium dark theme (near-black background, orange `#ff5b35` +
  amber `#ffb238` accents) borrowed from the in-store digital menu boards
  (`tv-*.html`). It is a stand-in, not the final brand.
- **Header:** a styled **text wordmark** — "SANDWICH FACTORY" — because there is
  no logo image yet (`src/components/Brandmark.tsx`).
- **App icon / splash:** Expo defaults (no custom assets committed).

Once §1 items 1 and 2 arrive, the swap is the `brand.ts` edit above plus the
four image files in `apps/mobile/assets/`.
