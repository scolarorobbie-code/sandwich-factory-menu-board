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
- **Square catalog pagination FIXED** — `fetchLiveMenu` now follows the cursor.
  Before, anything past page 1 (200+ objects) was silently dropped, which hid
  combo drink lists. This was the real cause of the "drink picker missing" bug.
- **`add-drink-set` script** (`npm run add-drink-set`) — attaches a "Choose Your
  Drink" modifier list to EVERY combo item in the sandbox. Idempotent, committed.

## Landed in the parallel-agent build pass (2026-06-14, all merged + typechecks green)
- **Real Square Loyalty (Stars)** — backend `loyalty.ts`: earn on payment +
  redeem rewards via the Loyalty API, Square as source of truth. Fails soft if no
  loyalty program exists. Mock keeps local 50-Stars=$5 so it still demos.
- **Mobile loyalty UI** — phone field at sign-up (optional, for Stars mapping) +
  "Use N Stars · save $X" redeem control at checkout that recomputes the total.
- **Merchant control panel — backend + dashboard** — override layer (`overrides.ts`,
  applied in `menu.ts`): per-group required/min/max + conditional rules, per-item
  hidden/sold-out + prep time. Admin auth (`POST /admin/login`, `ADMIN_PASSWORD`
  secret, 8h admin JWT). **Web dashboard served at `GET /admin`** (`public/admin.html`).
- **One-tap reorder** — order-history rows re-add their items to the cart (resolves
  historical names against the live menu; skips items that no longer exist).
- **Saved favorites** — heart on ItemDetail saves a build; Favorites section in
  Account with one-tap add. Uses existing favorites endpoints.
- **Premium polish** — skeleton loaders (replace bare spinners) + haptics
  (`expo-haptics`, lazy + crash-proof). ⚠️ Owner must `npm install` for haptics.
- **Strategy docs (read these):** `docs/COMPETITIVE_ANALYSIS.md` (franchise-app
  teardown + prioritized punch-list) and `docs/WEB_SOCIAL_AUDIT.md` (website +
  social audit — note: the current website's ordering is Orda-built and dies when
  he leaves Orda; the app becomes the ordering path).
- **Control panel design + remaining work:** `docs/CONTROL_PANEL.md`.

## Landed in the SECOND parallel-agent pass (2026-06-17, all merged, green, pushed)
- **Test suite + CI** — Vitest, **56 passing backend tests** (`npm test` / `cd
  services/backend && npm run test`) covering webhook HMAC verify + event dedupe,
  order pricing + tax + Stars redemption math, loyalty tier selection, overrides
  apply, and Square modifier-group mapping. **GitHub Actions CI** (`.github/
  workflows/ci.yml`) typechecks backend + mobile and runs tests on every push/PR.
- **Control panel now PERSISTS** — overrides moved to Cloudflare KV (`OVERRIDES`
  binding) with in-memory fallback for local dev/tests. No more reset-on-restart.
  Owner creates the namespace before deploy: `cd services/backend && npx wrangler
  kv namespace create OVERRIDES` (also documented for `IDEMPOTENCY`).
- **Prep time → Square `pickup_at`** — orders now carry a scheduled pickup time =
  now + max(prep minutes across items, floor 10), instead of always ASAP.
- **Push notifications wired end-to-end** — mobile registers an Expo push token on
  sign-in (crash-proof, no-ops in Expo Go/sim); backend sends real Expo pushes from
  the VERIFIED webhook path: `order.created` → staff tablet, `order.updated`/
  `order.fulfillment.updated` → customer "ready for pickup". Staff tablet set via
  long-press Account greeting OR `STAFF_PUSH_TOKEN` env; `NTFY_TOPIC` backup channel.
  ⚠️ Owner must `npm install` (new `expo-notifications` dep). ⚠️ REAL push delivery
  needs an EAS dev build on a PHYSICAL device — cannot be verified in Expo Go/sim.

## Landed in the deals-in-panel pass (2026-06-17, green)
- **App-exclusive deals now managed from the control panel** — the last open
  control-panel item. `DealOverride` became a full, additive deal definition
  (title/description/code/dates/enabled/appExclusive + a `DealDiscount` spec:
  `freeItem` / `amountOff` / `doubleStars`). Deals live in the same KV-backed
  overrides document items use; `getDeals(env)` (now async) reads + maps them to
  the unchanged app-facing `Deal` contract, seeding the two shipped deals when the
  store is empty so nothing disappears. Checkout (`orders.ts`) applies the discount
  from the override spec (`dealDiscountCents`) instead of a hardcoded id check —
  behavior equivalent; Square still computes LIVE totals. `admin.html` gained a
  Deals section (list/add/edit/remove/toggle/dates/discount). 15 new backend
  tests (71 total, all green). Square stays the price source of truth — deals are
  an app promo layer. See `docs/CONTROL_PANEL.md`.

## Decisions (owner-confirmed)
- Photos: real Square + AI fallback. Brand: **match website** (awaiting his logo +
  colors — site is bot-blocked, he must send the image). Customization: collapsible.
  Loyalty: **use his Square Loyalty program**. Focus: premium look.
- **Modifier limits (required/min/max) and conditional rules are NOT in Square** —
  they live in Orda's panel today. Decision: set basics in Square for now; **BUILD
  a merchant control panel later** (Orda-style admin: required/min/max, conditional
  modifiers, hide items, prep time, deals). Tracked in CLAUDE.md.

## Next steps (in priority order)
1. **`npm install` on his Mac** — REQUIRED now (new deps: `expo-haptics`,
   `expo-notifications`, `vitest`). Then `npm run add-drink-set`, restart backend,
   ⌘R, and confirm a combo → "Choose Your Drink" appears.
2. **Run a real end-to-end test order** — the full flow is built and ready.
   See the test protocol below.
3. **Branding** — STILL BLOCKED on the owner: need his logo (PNG/vector) + brand
   colors + storefront/food photos. Then: extract colors, apply theme, logo in
   header + splash. This is the #1 thing only he can unblock.
4. **EAS dev build** — the gate for testing what Expo Go can't: real Square
   In-App Payments AND real push delivery. Needs his Expo + Apple accounts.
   Path: `npx testflight` (build + submit in one step) once configured.
5. **Control panel — DONE.** Deals are now managed in-panel (the last open item):
   `DealOverride` is a full deal definition (+ `DealDiscount`), `getDeals(env)`
   reads them from the KV-backed overrides store (seeded with the two launch
   deals when empty), checkout applies the discount from the override spec, and
   `admin.html` has a Deals section (list/add/edit/remove/toggle). KV persistence,
   prep-time→pickup_at, and mobile reading conditional overrides were already DONE.
   See `docs/CONTROL_PANEL.md` — nothing control-panel-related remains.
6. **Loyalty — to actually test Stars:** sandbox needs an ACTIVE loyalty program
   configured; loyalty maps by phone (now captured at sign-up).
7. **Work the competitive punch-list** in `docs/COMPETITIVE_ANALYSIS.md`.

## Test order protocol (Phase 1 verification)
Do this to prove the real square loop works:

**Before you start:** backend must be running (`npm run backend:dev` → wait for
`Ready on http://localhost:8787`). App must be open in simulator.

1. In the app: tap a combo sandwich (e.g. "Mile High Corned Beef").
2. Pick a size/variation. Choose a combo modifier if one is shown. The "Choose
   Your Drink" group should auto-appear — pick a drink.
3. Tap "Add 1 · $X.XX". You'll land in the cart.
4. Tap "Go to checkout". If not signed in, create an account (any email/password).
5. Checkout screen shows the order total (tax computed by Square, not us).
6. Tap the gold "Pay $X.XX" button — this uses Square's sandbox test card nonce;
   no real money moves.
7. **Verify in Square dashboard (sandbox):**
   - Go to squareupsandbox.com → Orders. Your order should appear as PICKUP.
8. Order Status screen shows "Order received". Tap "Simulate staff updating the
   order" twice → status moves MAKING → READY → shows "Come grab it at the counter!"
9. Check the staff push: if ntfy.sh / Expo push token is set, a notification fires.

If any step fails, copy the red error text and send it here.

## How to run locally / connect Square
See **COMMANDS.md**. Square integration spec: **docs/SQUARE_INTEGRATION.md**.
Secrets live only in `services/backend/.dev.vars` (gitignored) — never commit them.

## Design preview files (not part of the app)
`/home/user/app-preview.html` + `app-screens.html` were throwaway visual mockups.
