# Mobile app — React Native + Expo

The customer-facing pickup ordering app. Talks only to our backend (never to
Square directly).

## Run it (Phase 0)

In one terminal, start the backend (serves the mock menu):

```bash
npm run backend:dev          # from repo root -> http://localhost:8787
```

In another, start the app:

```bash
npm install                  # from repo root
npm run mobile:start         # expo start; press i for iOS simulator
```

You should see the first menu category load from the backend. Pull to refresh.

Point the app at a different backend with:

```bash
EXPO_PUBLIC_API_BASE_URL=https://sandbox-api.sandwichfactorytn.com npm run mobile:start
```

## ⚠️ Expo Go vs. payments

The menu/cart/auth UI runs fine in **Expo Go**. But the **Square In-App Payments
SDK uses native code that Expo Go can't load** — so once we add payments
(Phase 1), you test on an **EAS development build**, not Expo Go. This is wired
via an Expo config plugin when we get there.

## Layout

| File | Purpose |
|---|---|
| `App.tsx` | Root component |
| `src/screens/MenuScreen.tsx` | Phase 0: renders a menu category from the backend |
| `src/api/client.ts` | Typed API client (uses shared @sf/contract types) |
| `src/config.ts` | Reads `EXPO_PUBLIC_API_BASE_URL` |
| `metro.config.js` | Monorepo config so `@sf/contract` resolves |
