import { describe, expect, it, vi } from "vitest";

/**
 * The Square In-App Payments fallback. squarePayments.ts imports `react-native`
 * (Platform) at module load, so we MOCK `react-native` to a minimal stub — we
 * are exercising the JS fallback decision, not native code.
 *
 * The native `react-native-square-in-app-payments` module is NOT installed in
 * this environment, so `require()` of it inside the module naturally throws and
 * is caught — exactly the Expo Go / web / sim "module absent" path. In that
 * path requestCardNonce() must resolve the sandbox test nonce so checkout works
 * unchanged.
 */

// Default mock: a non-mobile platform (web). `supported` is false → guaranteed
// fallback regardless of whether the optional native module is present.
vi.mock("react-native", () => ({ Platform: { OS: "web" } }));

describe("requestCardNonce fallback (native module absent)", () => {
  it("resolves the Square sandbox test nonce when native card entry is unavailable", async () => {
    const { requestCardNonce, SANDBOX_TEST_NONCE, isNativeCardEntryAvailable } = await import(
      "../payments/squarePayments"
    );

    expect(isNativeCardEntryAvailable()).toBe(false);

    const result = await requestCardNonce();
    expect(result).toEqual({ nonce: SANDBOX_TEST_NONCE });
    // Hard rule: this is the exact nonce the sandbox/mock backend accepts.
    expect(result.nonce).toBe("cnon:card-nonce-ok");
    expect(result.verificationToken).toBeUndefined();
  });

  it("initSquarePayments is a safe no-op (never throws) without the native SDK", async () => {
    const { initSquarePayments } = await import("../payments/squarePayments");
    await expect(initSquarePayments()).resolves.toBeUndefined();
  });
});

describe("requestCardNonce fallback on a mobile platform with module absent", () => {
  it("still falls back to the sandbox nonce when the native module can't be required", async () => {
    // Re-mock react-native as iOS so `supported` is true; the optional native
    // module require still throws (not installed) → fallback path on device too.
    vi.resetModules();
    vi.doMock("react-native", () => ({ Platform: { OS: "ios" } }));

    const { requestCardNonce, isNativeCardEntryAvailable } = await import(
      "../payments/squarePayments"
    );

    expect(isNativeCardEntryAvailable()).toBe(false);
    const result = await requestCardNonce();
    expect(result.nonce).toBe("cnon:card-nonce-ok");

    vi.doUnmock("react-native");
    vi.resetModules();
  });
});
