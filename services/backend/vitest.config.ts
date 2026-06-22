import { defineConfig } from "vitest/config";

// Unit tests run in Node (not the Workers runtime). The pure logic under test
// only needs WebCrypto (globalThis.crypto), which Node 20+ provides natively,
// and a mockable global `fetch` at the Square boundary. We deliberately do NOT
// spin up the Workers runtime here — these are focused unit tests of pure
// functions, with Square calls mocked at `global.fetch`.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    globals: false,
  },
});
