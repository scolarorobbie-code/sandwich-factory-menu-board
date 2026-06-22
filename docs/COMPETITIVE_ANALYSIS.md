# Competitive Analysis — making Sandwich Factory feel like a top-tier app

_Last updated 2026-06-16. Audience: the owner (non-technical) + whoever builds
next. Read CLAUDE.md and STATUS.md first. This doc is research + an opinionated
to-do list. It changes no code._

## Who we are, and what we're up against

We are **one sandwich shop** in Murfreesboro, replacing a rented Orda app with a
**fully-owned, Square-powered pickup app**. We are not Starbucks. We can't build
50 engineers' worth of features — and we don't need to. The good news: the
features that actually make these famous apps feel premium are mostly **small,
copyable touches**, not enterprise machinery. A single shop on Square can match
the *feel* of a national chain by copying the right 10 things.

The apps below are the bar customers silently measure us against. Below is what
each one nails, the patterns they share, and — the real deliverable — a
**prioritized punch-list mapped to our actual screens**, plus a premium look &
feel checklist and a list of traps to avoid given our pickup-only, Square-only
constraints.

A useful reframe: most of these chains win on **speed to a repeat order** and
**a loyalty number the customer trusts**, not on flashy menus. Our current app
browses and orders well but makes a regular re-buy their usual from scratch
every time. That's the single biggest gap.

---

## Per-app teardown — what they nail

### Chipotle
- **Customize down to "light / regular / extra / on the side"** for every
  ingredient — the customer feels in total control. ([QSR Magazine](https://www.qsrmagazine.com/news/chipotle-launches-complete-customization-feature/))
- **One-tap reorder from Favorites** — save an exact build once, re-buy it in
  seconds with no re-customizing. ([Chipotle app guide](https://chipocatering.com/chipotle-app/))
- **Past-order history that doubles as a reorder list** — every order is a
  shortcut to buying it again. ([Chipotle app guide](https://chipocatering.com/chipotle-app/))
- Free chips & guac after first order, birthday reward, early access — small
  perks that make membership feel worth it. ([Chipotle app guide](https://chipocatering.com/chipotle-app/))

### Starbucks (the gold standard)
- **Order, customize, and pay all live in one tight flow** — minimal taps,
  reduces in-store wait. The app is repeatedly cited as best-in-class usability. ([Built In](https://builtin.com/design-ux/starbucks-mobile-loyalty-rewards-order-payment), [Medium case study](https://medium.com/@the_manifest/the-success-of-starbucks-app-a-case-study-f0af6709004d))
- **Rewards are baked into every screen** — you always know your Stars and what
  the next reward costs. ~40% of sales tie to the rewards program. ([Harvard D3](https://d3.harvard.edu/platform-digit/submission/starbucks-winning-on-rewards-loyalty-and-data/))
- **Stored balance / fast pay** — payment is a non-event, not a card form. ([Starbucks](https://www.starbucks.com/rewards/mobile-apps/))
- **Personalized offers** make the app feel like it knows you. ([Built In](https://builtin.com/design-ux/starbucks-mobile-loyalty-rewards-order-payment))

### Chick-fil-A
- **Save favorites + reorder in a few taps**, with order history feeding quick
  re-buys. ([Chick-fil-A](https://www.chick-fil-a.com/customer-support/chick-fil-a-one-membership-program/creating-and-managing-your-account/how-do-i-add-edit-or-delete-my-favorite-orders-on-the-chick-fil-a-app))
- **Points are generous and legible** — 10 pts per $1, first reward at 200, so
  progress feels fast and the math is obvious. ([Chick-fil-A One](https://www.chick-fil-a.com/one))
- **Smart "free favorite" rewards** — the app surfaces *your* usual items as
  the reward, not generic ones. ([Retail Dive](https://www.retaildive.com/ex/mobilecommercedaily/chick-fil-a-revamps-mobile-ordering-experience-with-personalized-reward-offers))
- **Choose pickup method + pay from phone, skip the line** — pickup is the hero
  flow, not an afterthought. ([Chick-fil-A](https://www.chick-fil-a.com/app-download))

### Panera
- **Rapid Pick-Up shelf** — order ahead, your food is waiting on a named shelf;
  no counter interaction. Clean pickup mental model. ([Panera](https://www.panerabread.com/en-us/press/press-room/panera-launches-drive-thru-pick-up-nationwide.html))
- **"Crunch Time" — pre-program a usual meal for a set time** with a reminder
  and one swipe to confirm. ([Restaurant Dive](https://www.restaurantdive.com/news/panera-crunch-time-ordering-myrewards-app/694193/))
- **Rewards you *choose* based on what you're craving** + birthday reward +
  surprise offers. ([Panera app](https://apps.apple.com/us/app/panera-bread/id692365393))

### Jersey Mike's (closest analog to us)
- **Customize bread + toppings + "Mike's Way" one-tap** preset — a signature
  build is a single tap. ([Jersey Mike's](https://www.jerseymikes.com/app))
- **Order history → one-tap reorder** of a customized sub. ([Jersey Mike's app guide](https://jersymikemenu.com/jersey-mikes-app/))
- **Order scheduling** (pick a pickup time) added in their app revamp. ([Fast Casual](https://www.fastcasual.com/news/jersey-mikes-unveils-revamped-mobile-app-with-order-scheduling/))
- **Shore Points auto-tracked with nudges** when you're close to a reward. ([Jersey Mike's app guide](https://jersymikemenu.com/jersey-mikes-app/))

### Jimmy John's
- **Speed as the brand** — a few taps from open to order; "repeat last order"
  is front-and-center. ([Detroit Labs](https://www.detroitlabs.com/work/jimmy-johns/))
- **Granular live order tracking** — bread sliced → leaving the shop → near you;
  removes the "is it ready?" anxiety. ([Jimmy John's app guide](https://jimyjohnmenu.com/jimmy-johns-app/))
- **Frictionless rewards** — free sandwich after first order; one-tap earn + pay. ([Smile.io case study](https://blog.smile.io/rewards-case-study-jimmy-johns-freaky-fast-rewards/))
- **Ready-for-pickup push notifications** as a core feature. ([App Store](https://apps.apple.com/us/app/jimmy-johns-sandwiches/id409366411))

### Subway
- **Build + name your custom sub for instant reorder** — "name your usual." ([Subway](https://www.subway.com/en-us/downloadapp))
- **Rapid Re-Order: last orders / favs one tap from the menu bar.** ([Subway](https://www.subway.com/en-us/downloadapp))
- **MVP tiers (Pro / Captain / All-Star)** make earning feel like progress, not
  just a balance. ([Subway Rewards](https://swpe.test.subway.com/en-us/rewards))

### Domino's (for the tracker only — they're delivery, we're pickup)
- **The Pizza Tracker** — the original, iconic order-status UX. It solved
  *uncertainty*, not speed: customers want to know where their order is. ([Medium UX writeup](https://medium.com/@The.Nikki.Chronicles/dominos-pizza-tracker-turning-frowns-into-funds-with-ux-aad760b75c1a))
- **Live Activities on the iPhone Lock Screen** — follow status without opening
  the app. ([Domino's PR](https://ir.dominos.com/news-releases/news-release-details/dominosr-updates-its-iconic-industry-first-tracker-even-better))

---

## Patterns the best apps share (the cheat sheet)

1. **One-tap reorder is the #1 retention feature.** Every single app makes
   re-buying your usual nearly instant via Favorites + order history. Regulars
   are the whole business for a neighborhood shop.
2. **Loyalty is omnipresent and legible.** You always see your points, the next
   reward, and how close you are — on the home screen, in the cart, at checkout.
3. **Pickup is the hero, not an edge case.** A clear pickup mental model
   (shelf / counter / named slot) + a "ready" push.
4. **Order status removes anxiety.** A clear visual tracker + a "ready" push is
   table stakes (Domino's, Jimmy John's).
5. **Signature one-tap presets** ("Mike's Way", "name your sub") let people
   skip customization without losing it.
6. **Payment is invisible.** Apple Pay / stored card, never a card form.
7. **Small perks create membership feeling** — birthday reward, first-order
   freebie, app-only deals, surprise offers.
8. **Premium feel = polish, not features** — skeleton loaders, haptics, real
   photography, generous spacing, smooth transitions.

---

## THE PUNCH-LIST — prioritized improvements for OUR app

Sorted by bang-for-buck (most value per unit of effort first). Effort: **S** =
hours, **M** = a day or two, **L** = several days+. "Lives in" maps to our real
files (under `apps/mobile/src/`). "Started?" flags what's already partly built
(so we finish, not rebuild).

| # | Improvement | Why it matters | Effort | Lives in | Started? |
|---|-------------|----------------|--------|----------|----------|
| 1 | **One-tap reorder from order history** — make each row in Account → Order history a "Reorder" button that re-adds its line items to the cart | The single highest-retention feature in every competitor. Regulars are our bread and butter. Backend already returns full `lineItems` per order | **S–M** | `screens/AccountScreen.tsx` (history rows), `state/cart.tsx` (add-from-lineItems helper) | **Yes** — order history + `lineItems` already exist; just no reorder action |
| 2 | **Saved Favorites ("My usual")** — let a signed-in user save a build/order and re-buy it in one tap; show favorites at top of Menu & Account | Chipotle/Subway/Jersey Mike's all lead with this. The data model and API are already built | **M** | New `FavoritesScreen` or section in `AccountScreen.tsx` + `MenuScreen.tsx` header; `api/client.ts` (add `createFavorite`, `deleteFavorite`); `state/cart.tsx` | **Mostly** — `Favorite`/`CreateFavoriteRequest` types, backend endpoints, and `api.favorites()` GET all exist; UI + create/delete client calls missing |
| 3 | **Loyalty everywhere, not just Account** — show Stars + "next reward" in the cart and at checkout, and add a "Redeem" action when eligible | Starbucks/Chick-fil-A keep rewards in your face; it drives the next order. Checkout already computes `starsEarned` | **S–M** | `screens/CartScreen.tsx`, `screens/CheckoutScreen.tsx`; backend `loyalty.ts` (redeem endpoint); `api/client.ts` (add `redeem`) | **Partly** — `Loyalty` shown in Account, `starsEarned` shown at checkout; no redeem flow, not surfaced in cart |
| 4 | **Real push notifications wired in-app** — register the Expo token on sign-in and fire "Order ready for pickup" | Removes "is it ready?" anxiety; it's the core pickup payoff and Phase-1 definition of done. Backend push + `registerDevice` exist | **M** | `state/auth.tsx` or `App.tsx` (token registration), `api/client.ts` (`registerDevice` exists); backend `push.ts` | **Partly** — backend push + `api.registerDevice` exist; app never registers a token. Needs EAS dev build to test |
| 5 | **Pickup-time clarity + "ASAP / pick a time"** — show an estimated ready time and let the user pick ASAP or a later slot on Checkout | Jersey Mike's added scheduling; Baymard says a "Now" option + visible timing is expected. Maps to Square `pickup_at` and our `prepTimeMinutes` override | **M** | `screens/CheckoutScreen.tsx` (time selector + ETA), `state/cart.tsx`; backend `orders.ts` → Square `pickup_at`; `prepTimeMinutes` override already in contract | **Partly** — `prepTimeMinutes` override field exists in contract; not used. App is ASAP-only with no ETA |
| 6 | **Skeleton loaders instead of spinners** — replace the bare `ActivityIndicator` on Menu/Checkout/OrderStatus with grey card placeholders | Cheapest possible "premium" upgrade; makes the app feel instant. Pure front-end | **S** | `screens/MenuScreen.tsx`, `screens/CheckoutScreen.tsx`, `screens/OrderStatusScreen.tsx`, new `components/Skeleton.tsx` | No |
| 7 | **Haptics + button press feedback** — light tap on add-to-cart, success buzz on order placed, selection tick in customization | Universal premium cue; trivial with `expo-haptics`. Makes every interaction feel responsive | **S** | `components/Button.tsx`, `screens/ItemDetailScreen.tsx`, `screens/CheckoutScreen.tsx` (on success) | No |
| 8 | **Make deals actionable** — tapping an app-exclusive deal jumps to the relevant item / applies the code, instead of showing a code to memorize | Our Deals screen is read-only text today; competitors make offers one tap to use | **M** | `screens/DealsScreen.tsx`, `state/cart.tsx`, backend `menu.ts`/overrides for deal→item linkage | **Partly** — Deals screen + `Deal` type with `code` exist; no apply action |
| 9 | **Apple Pay at checkout** — offer Apple Pay through the Square In-App Payments SDK in addition to card entry | "Invisible payment" is a shared premium pattern; Square's SDK supports it. Reduces checkout friction massively | **M** | `screens/CheckoutScreen.tsx` (replace test nonce path), Square config plugin; backend `payments.ts` unchanged | **Partly** — payment path exists with sandbox nonce; needs EAS build + SDK wiring |
| 10 | **Signature one-tap presets** ("The usual" / a Mike's-Way-style default build) on popular items | Lets people skip the modifier groups; speeds the most common orders | **M** | `screens/ItemDetailScreen.tsx` (preset chips), driven later by the merchant control-panel overrides | **Partly** — override layer (`ItemOverride`/`GroupOverride`) can store presets later |
| 11 | **Real food photography pass** — replace the loremflickr placeholders with real shots of the actual subs for the top ~20 sellers | Imagery is the biggest single driver of "looks expensive." Placeholders read as cheap | **M** (mostly the owner shooting photos) + **S** to wire | Square Catalog images (source of truth) → `screens/MenuScreen.tsx`/`screens/ItemDetailScreen.tsx` already render `imageUrl` | **Partly** — real Square photos render when present; many items still fall back to stock |
| 12 | **Order-status polish: ETA + Live Activity / richer tracker** — show "Ready in ~8 min", and (later) an iOS Live Activity on the lock screen | Domino's-style certainty. Our tracker is good but has no time and a visible "simulate staff" dev button | **M** (ETA) / **L** (Live Activity) | `screens/OrderStatusScreen.tsx` (hide the dev "simulate" button in prod; add ETA) | **Partly** — three-step tracker built; no ETA, dev button still shown |
| 13 | **Brand the chrome** — replace emoji tab icons (🥪🔥⭐) and apply the real logo + website colors to header/splash | Emoji icons are the clearest "not a real franchise app" tell | **S** (blocked on logo/colors) | `navigation/RootNavigator.tsx` (tab icons), `theme.ts`, `app.json` (splash/icon) | **Blocked** — waiting on owner's logo + brand colors |
| 14 | **Loyalty tiers / progress bar** — a visual "X Stars to your next reward" bar; later, tiers like Subway MVP | Progress framing outperforms a bare number for repeat behavior | **S–M** | `screens/AccountScreen.tsx`, `screens/CartScreen.tsx`; backend `loyalty.ts` (Square Loyalty tiers if configured) | **Partly** — Stars + next reward cost already returned by `loyalty()` |

**Do-this-first order (owner-readable):** Start with **#1 reorder** and **#2
favorites** — they reuse code that's already built and are what keeps regulars
coming back. Then **#3 loyalty in cart/checkout** and **#6 skeletons + #7
haptics** (a single polish afternoon). Then **#4 push** and **#9 Apple Pay**,
which both require the EAS dev build, so batch them. Brand chrome (#13) is the
fastest premium win but is blocked until the owner sends the logo and colors.

---

## Premium look & feel checklist

Apply these across all screens to make it feel like a top-tier franchise app.
Most are an afternoon each; none change the architecture.

- **Imagery:** real, well-lit photos of the actual food for top sellers; consistent
  crop/aspect ratio; never mix a real photo and an emoji placeholder side by side.
- **Typography:** one strong display weight for prices/headers, one readable body
  weight; consistent sizes (we already use 800/900 weights — keep a scale, e.g.
  28 / 20 / 17 / 15 / 13). Consider a branded font once colors land.
- **Spacing & rhythm:** generous, consistent padding (16/20 base); don't crowd —
  whitespace reads as premium. Align prices to a single right edge.
- **Motion:** subtle add-to-cart animation (item flies to cart bar), smooth
  screen transitions, animated count on the cart badge, gentle press-scale on
  cards/buttons.
- **Haptics:** light impact on selection, success notification on order placed,
  warning on a validation error. (`expo-haptics`)
- **Skeleton loaders:** grey placeholder cards that match final layout on Menu,
  Checkout, and Order Status — never a lone spinner on a blank screen.
- **Empty states:** friendly, branded empty states with a clear CTA (the empty
  cart already does this; extend to "No favorites yet — save your usual," "No
  orders yet," "No deals right now").
- **Buttons:** consistent primary (gold) / secondary styling, clear disabled
  states, a loading spinner inside the button (already partly done in `Button`).
- **Micro-copy:** warm, on-brand text ("Come grab it at the counter!" is good —
  extend that voice everywhere).
- **Pull-to-refresh** on Menu and Order history.
- **Safe-area & polish:** respect the notch/home indicator, sticky bars that
  don't overlap content, consistent corner radii (we use 12–18; pick a scale).
- **Dark mode is already our default** — keep contrast high and accents (gold
  #ffb238 / orange #ff5b35) used sparingly for emphasis.

---

## Traps — things NOT to chase (conflict with our constraints)

- **Delivery, driver tracking, address logic, drive-thru, "out for delivery"
  maps.** We are **pickup only** (CLAUDE.md). Domino's/Jimmy John's delivery
  tracking is inspiration for *status certainty*, not a feature to copy. Our
  tracker should be Ordered → Making → Ready, with a pickup ETA — nothing more.
- **A stored cash balance / reloadable gift card (Starbucks model).** That's a
  prepaid-funds product with its own compliance weight. Use **Square loyalty
  Stars** for the "rewards" feel and **Apple Pay / Square tokenized card** for
  payment — never build a wallet or a custom card form (hard rule #2).
- **Group ordering (Chipotle).** Nice for offices, but heavy; not worth it for a
  single shop at this stage. Defer.
- **Subscriptions (Panera Sip Club).** Recurring billing is a separate beast;
  out of scope.
- **Storing prices, menu, or loyalty rules as our own source of truth.** Square
  is the source of truth (CLAUDE.md). Reorder/favorites must snapshot *Square*
  item/variation/modifier IDs and re-price against the live menu at order time —
  never cache a stale price. Deals and modifier-rule presets live in the
  **override layer**, not as a competing menu.
- **Personalized AI recommendations / "smart" reward selection.** Lovely at
  Chick-fil-A scale; premature for us. A simple Favorites + "order again" list
  delivers 90% of the value with none of the data plumbing.
- **Conditional/required modifier rules beyond what Square expresses.** These
  belong in the planned **merchant control panel** override layer, not hardcoded
  per item. The combo→drink regex heuristic in `ItemDetailScreen` is a bridge,
  not the destination (see `ConditionalRule` in `contract/types.ts`).

---

## Sources

- Chipotle: [QSR Magazine — Complete Customization](https://www.qsrmagazine.com/news/chipotle-launches-complete-customization-feature/), [Chipotle app guide](https://chipocatering.com/chipotle-app/)
- Starbucks: [Built In](https://builtin.com/design-ux/starbucks-mobile-loyalty-rewards-order-payment), [Harvard D3](https://d3.harvard.edu/platform-digit/submission/starbucks-winning-on-rewards-loyalty-and-data/), [Starbucks Rewards](https://www.starbucks.com/rewards/mobile-apps/), [Manifest case study](https://medium.com/@the_manifest/the-success-of-starbucks-app-a-case-study-f0af6709004d)
- Chick-fil-A: [Chick-fil-A One](https://www.chick-fil-a.com/one), [App download](https://www.chick-fil-a.com/app-download), [Favorites support](https://www.chick-fil-a.com/customer-support/chick-fil-a-one-membership-program/creating-and-managing-your-account/how-do-i-add-edit-or-delete-my-favorite-orders-on-the-chick-fil-a-app), [Retail Dive](https://www.retaildive.com/ex/mobilecommercedaily/chick-fil-a-revamps-mobile-ordering-experience-with-personalized-reward-offers)
- Panera: [Rapid/Drive-thru pickup](https://www.panerabread.com/en-us/press/press-room/panera-launches-drive-thru-pick-up-nationwide.html), [Crunch Time — Restaurant Dive](https://www.restaurantdive.com/news/panera-crunch-time-ordering-myrewards-app/694193/), [App Store](https://apps.apple.com/us/app/panera-bread/id692365393)
- Jersey Mike's: [Official app](https://www.jerseymikes.com/app), [Order scheduling — Fast Casual](https://www.fastcasual.com/news/jersey-mikes-unveils-revamped-mobile-app-with-order-scheduling/), [App guide](https://jersymikemenu.com/jersey-mikes-app/)
- Jimmy John's: [Detroit Labs](https://www.detroitlabs.com/work/jimmy-johns/), [Smile.io rewards case study](https://blog.smile.io/rewards-case-study-jimmy-johns-freaky-fast-rewards/), [App guide](https://jimyjohnmenu.com/jimmy-johns-app/), [App Store](https://apps.apple.com/us/app/jimmy-johns-sandwiches/id409366411)
- Subway: [Download/app features](https://www.subway.com/en-us/downloadapp), [MVP Rewards](https://swpe.test.subway.com/en-us/rewards)
- Domino's: [UX writeup](https://medium.com/@The.Nikki.Chronicles/dominos-pizza-tracker-turning-frowns-into-funds-with-ux-aad760b75c1a), [Tracker update PR](https://ir.dominos.com/news-releases/news-release-details/dominosr-updates-its-iconic-industry-first-tracker-even-better)
- Premium UX patterns: [Mobile UX 2025 — Webstacks](https://www.webstacks.com/blog/mobile-ux-design), [Microinteractions 2025 — Medium](https://rosalie24.medium.com/microinteractions-in-mobile-apps-2025-best-practices-c2e6ecd53569), [Pickup time UX — Baymard food delivery research](https://baymard.com/research/online-food-delivery)
