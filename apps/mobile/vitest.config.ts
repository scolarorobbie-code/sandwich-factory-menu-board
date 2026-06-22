import { defineConfig } from "vitest/config";

// Mobile unit tests run in plain Node — NOT in Expo/React Native. React Native
// modules pull in native code that can't load here, so tests import ONLY pure
// TS logic (reorder, cart math, the brand palette, the payments fallback). Pure
// helpers that live next to RN imports are extracted into RN-free sibling
// modules (e.g. cart.logic.ts, palette.ts) which the originals re-export.
//
// `@sf/contract` resolves via the workspace symlink, matching tsconfig's path
// alias, so test fixtures can use the shared contract types.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    globals: false,
  },
});
