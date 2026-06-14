# STATUS — where this project is right now

_For a Claude session picking up work. Read this + CLAUDE.md +
docs/SQUARE_INTEGRATION.md first. Commands for the owner are in COMMANDS.md._

## Who you're helping
Robert Scolaro, owner of Sandwich Factory (Murfreesboro, TN). **First-time, non-
technical app builder.** Explain in plain English, make the technical calls for
him, never ask him to choose between options he can't be expected to understand.
He runs commands on his Mac (Claude Code there); this branch is the source of truth.

## Branch
All work is on `claude/new-session-u4xoyc` (PR #1 open against `main`).

## Working today (verified)
- **Real menu live from Square.** `connect-square` + `mirror-catalog` copied his
  real production menu (129 items, 70 categories, 103 modifier lists) into the
  Square **sandbox**; the app shows it. Backend `isLive()` pulls the live catalog.
- **Menu screen:** sticky category jump-bar + bigger photo cards.
- **Photos:** real Square photos when present, else on-theme AI/stock placeholders
  (loremflickr by item-name keyword).
- **Customization:** collapsible groups; modifier groups ordered by the leading
  number in their Square name and that number is stripped for display.
- **Combo → drink:** conditional modifier — a group named "...Drink" only appears
  once a combo option is picked (app heuristic in ItemDetailScreen). Owner added a
  "Choose Your Drink" set in the sandbox via a one-off script.
- **Full ordering loop** (auth, cart, order, payment, status, loyalty/deals/
  favorites, webhook verify+dedupe) works on mock + sandbox; backend tested.

## Decisions (owner-confirmed)
- Photos: real Square + AI fallback. Brand: **match website** (awaiting his logo +
  colors — site is bot-blocked, he must send the image). Customization: collapsible.
  Loyalty: **use his Square Loyalty program**. Focus: premium look.
- **Modifier limits (required/min/max) and conditional rules are NOT in Square** —
  they live in Orda's panel today. Decision: set basics in Square for now; **BUILD
  a merchant control panel later** (Orda-style admin: required/min/max, conditional
  modifiers, hide items, prep time, deals). Tracked in CLAUDE.md.

## Next steps (in priority order)
1. **Branding** — once he sends his logo: extract colors, apply theme, add logo to
   header + splash. (Blocked on the logo image.)
2. **Run a real end-to-end test order** on the real menu (pay → Square order →
   staff alert → ready) to confirm Phase 1 done.
3. **Wire Square Loyalty** (real Stars earn/redeem via Loyalty API).
4. **Merchant control panel** (deferred but owner wants it).

## How to run locally / connect Square
See **COMMANDS.md**. Square integration spec: **docs/SQUARE_INTEGRATION.md**.
Secrets live only in `services/backend/.dev.vars` (gitignored) — never commit them.

## Design preview files (not part of the app)
`/home/user/app-preview.html` + `app-screens.html` were throwaway visual mockups.
