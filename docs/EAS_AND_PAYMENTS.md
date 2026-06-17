# EAS Build + Real Card Payments — Runbook

Plain-English guide for Robert (owner) and the next Claude session. This turns
the app's checkout from the **sandbox test card** into Square's **real
on-device card form**, and builds an installable iPhone app via EAS.

> **TL;DR of what's already done vs. what you do.**
> The app is wired and SAFE to keep using in Expo Go today — checkout still
> works with a sandbox test card and nothing here changes that. To get the REAL
> card form, you install ONE package and add ONE config block, then run an EAS
> build and test on a physical iPhone. That's it.

---

## Why this is a separate step (the constraint)

Square's card form is a **native** iOS/Android component. It **cannot run in
Expo Go** (the QR-code preview app) or the iOS Simulator. It only runs inside a
real build of our app installed on a real device. So the code is structured to:

- **In Expo Go / Simulator:** skip the native form and use Square's sandbox test
  nonce `cnon:card-nonce-ok`. Checkout works for demos and development.
- **In a real EAS build on a real iPhone:** present Square's card form, tokenize
  the card on-device, and send only the token to our backend. **We never see
  raw card numbers** (hard rule #2).

You do **not** need to touch any TypeScript. The fallback is automatic — the app
detects whether the native module is present.

---

## What is VERIFIED-HERE vs. VERIFY-ON-DEVICE

| Item | Status |
| --- | --- |
| App compiles with payments wiring (`npx tsc --noEmit` exit 0) | ✅ Verified here |
| Expo Go checkout unchanged (sandbox nonce fallback) | ✅ Verified here (typecheck + fallback logic) |
| Public Square application id wired into app config | ✅ Verified here |
| `react-native-square-in-app-payments` installs cleanly | ⚠️ Verify on your Mac |
| Native card form actually appears + tokenizes | ⚠️ **Verify on a physical iPhone** |
| Real sandbox card charge succeeds end-to-end | ⚠️ **Verify on a physical iPhone** |

The native SDK is **deliberately NOT in `package.json`** right now, so a plain
`npm install` can never break. You add it at build time (Step 2 below).

---

## One-time setup (do this once on your Mac)

You only need a free **Expo account** and the EAS CLI.

```bash
npm install -g eas-cli      # the EAS build tool
eas login                   # sign in (or create) your Expo account
cd apps/mobile
eas init                    # links this app to an Expo project, writes the projectId
```

`eas init` adds an `extra.eas.projectId` to `app.json` — leave it; our push code
already reads it.

---

## Step 1 — Make sure the basics still build (no payments yet)

From the repo root:

```bash
npm install
cd apps/mobile
npx tsc --noEmit            # should print nothing and exit 0
```

If that's clean, you're ready to add real payments.

---

## Step 2 — Add the Square card SDK (the ONE package + ONE config block)

### 2a. Install the package (run on your Mac, in `apps/mobile`)

```bash
cd apps/mobile
npx expo install react-native-square-in-app-payments
```

This is the official Square package: **`react-native-square-in-app-payments`**.
Our payments code already lazy-loads it by that exact name, so once it's
installed the app uses it automatically — no code change needed.

### 2b. Add the iOS deployment-target config

Square's iOS SDK requires **iOS 13.0+**. The cleanest Expo way is the
`expo-build-properties` config plugin. Install it and add the plugin block to
`app.json`.

```bash
npx expo install expo-build-properties
```

Then, in `apps/mobile/app.json`, add a top-level `"plugins"` array inside
`"expo"` (next to `"name"`, `"slug"`, etc.):

```jsonc
"plugins": [
  [
    "expo-build-properties",
    {
      "ios": { "deploymentTarget": "13.0" }
    }
  ]
]
```

> Note: `react-native-square-in-app-payments` does not ship its own Expo config
> plugin, but it links automatically during EAS Build's prebuild step. The only
> thing it needs from us is the iOS 13 deployment target above. If a future
> version of the package adds an Expo plugin, add its name to this same
> `plugins` array per its README.

### 2c. (Already done for you) The public Square application id

`app.json` → `expo.extra.squareApplicationId` is already set to the **public
sandbox application id** `sandbox-sq0idb-TDtiLZtopTCh-jcki61aMA` and
`squareEnvironment` is `"sandbox"`. This id is **public, not a secret** — it just
tells Square which merchant app is tokenizing. The private
`SQUARE_ACCESS_TOKEN` stays backend-only.

When you go fully live later: change `squareApplicationId` to your
**production** application id (starts with `sq0idp-`) and `squareEnvironment` to
`"production"`.

---

## Step 3 — Build a development build and install it on your iPhone

```bash
cd apps/mobile
eas build --profile development --platform ios
```

- EAS runs the build in the cloud (no Xcode needed). It will ask to log in to
  your Apple Developer account and register your test iPhone the first time —
  follow the prompts.
- When it finishes, EAS shows a QR code / link. Open it **on the iPhone** to
  install the app. (This is the "dev client" — it replaces Expo Go for this app.)
- Start the JS bundler so the app can load your code:

  ```bash
  npx expo start --dev-client
  ```

  Scan the new QR with the installed app.

> Point the app at your backend: set `EXPO_PUBLIC_API_BASE_URL` to your
> machine's LAN IP (e.g. `http://192.168.1.20:8787`) or your deployed Worker.
> The `development` profile in `eas.json` defaults it to `http://localhost:8787`
> for the simulator case; on a real phone use the LAN IP or deployed URL.

---

## Step 4 — Test a REAL sandbox card (on the iPhone)

1. In the app: browse → add an item → checkout.
2. Tap **Pay**. Square's **card form now appears** (instead of the silent
   sandbox nonce). The footer note will read "Enter your card... secured by
   Square".
3. Enter a **Square sandbox test card** (these never charge real money):
   - Card number: `4111 1111 1111 1111`
   - Expiry: any future date (e.g. `12/27`)
   - CVV: `111`
   - ZIP: `94103`
4. The card is tokenized on-device; the app sends only the token to our backend,
   which calls Square `CreatePayment`. You should land on the order-status
   screen, see the order in your Square **sandbox** dashboard, and (with a real
   dev build) get the staff-tablet push.

Square's full sandbox test-card list (including cards that simulate declines and
SCA challenges) is in Square's developer docs under "Sandbox test values."

**This is the only step that REQUIRES a physical device.** The card form will
not appear in Expo Go or the Simulator — that's expected; those keep using the
sandbox nonce.

---

## Step 5 — Production build + TestFlight (when ready to ship)

The App Store listing already exists ("Sandwich Factory Online" under Scolaro
Enterprises Inc) — we ship an **update**, not a new listing.

```bash
cd apps/mobile
# Build the production binary:
eas build --profile production --platform ios
# Submit it to App Store Connect / TestFlight:
npx testflight
```

`npx testflight` (Expo's helper) uploads the latest production build straight to
TestFlight so you and the staff can test it on real devices before release.
(Equivalent: `eas submit --profile production --platform ios`.)

Before a production build: flip `squareApplicationId` / `squareEnvironment` in
`app.json` to your **production** Square app id, and make sure the backend has
**production** Square credentials (`SQUARE_ENVIRONMENT=production`,
`SQUARE_ACCESS_TOKEN`, etc.) set as Worker secrets.

---

## Android (later — Phase 3)

The same package works on Android. When you get there:

```bash
eas build --profile development --platform android
```

Square's Android SDK needs `minSdkVersion` 24+; add it to the same
`expo-build-properties` block under `"android": { "minSdkVersion": 24 }` if a
build complains. Otherwise the flow is identical.

---

## If something goes wrong

- **`npm install` broke after adding the package** → remove
  `react-native-square-in-app-payments` from `apps/mobile/package.json` and
  reinstall. The app falls straight back to the sandbox nonce and keeps working;
  you can retry the install separately.
- **Card form doesn't appear, app uses sandbox nonce on the phone** → the native
  module didn't link. Confirm the package is in `package.json` and rebuild with
  `eas build` (a JS-only reload won't add native code). Check the device logs for
  the line `Square In-App Payments SDK initialized`.
- **`Payment was declined`** → you used a non-sandbox card while in sandbox, or
  the backend isn't in sandbox mode. Use the test card above and confirm the
  backend `SQUARE_ENVIRONMENT`.

---

## How the code is wired (for the next Claude session)

- `apps/mobile/src/payments/squarePayments.ts` — crash-proof abstraction.
  Lazy-`require`s `react-native-square-in-app-payments`, Platform-guarded,
  try/catch everywhere. Exposes `initSquarePayments()`,
  `isNativeCardEntryAvailable()`, `requestCardNonce()`. Falls back to
  `cnon:card-nonce-ok` when the module is absent. Mirrors `src/haptics.ts` /
  `src/push.ts`.
- `apps/mobile/App.tsx` — calls `initSquarePayments()` once at startup
  (no-op in Expo Go).
- `apps/mobile/src/screens/CheckoutScreen.tsx` — `pay()` now calls
  `requestCardNonce()` and forwards `nonce` + `verificationToken` to `api.pay`.
- `apps/mobile/src/api/client.ts` — `api.pay(orderId, sourceId, verificationToken?)`
  already forwards the verification token; the backend
  (`services/backend/src/payments.ts`) already accepts and uses it.
- `apps/mobile/app.json` → `expo.extra.squareApplicationId` /
  `squareEnvironment` — the public SDK config.
- `apps/mobile/eas.json` — `development` / `preview` / `production` build
  profiles.
