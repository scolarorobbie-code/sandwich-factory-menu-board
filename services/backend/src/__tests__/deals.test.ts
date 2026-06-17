import type { DealOverride } from "@sf/contract";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  dealDiscountCents,
  defaultDealOverrides,
  getApplicableDealOverride,
  getDeals,
} from "../menu";
import { overridesStore } from "../overrides";
import { mockEnv } from "./fixtures";

const env = mockEnv();

// A far-future/past pair for window tests.
const FUTURE = new Date(Date.now() + 86_400_000).toISOString();
const PAST = new Date(Date.now() - 86_400_000).toISOString();

beforeEach(() => overridesStore.reset());
afterEach(() => overridesStore.reset());

describe("getDeals — seeded from defaults when the store is empty", () => {
  it("returns the two shipped launch deals when no deals are stored", async () => {
    const deals = await getDeals(env);
    const ids = deals.map((d) => d.id).sort();
    expect(ids).toEqual(["deal-double-stars", "deal-free-cookie"]);
    // Mapped to the app-facing Deal contract shape.
    const cookie = deals.find((d) => d.id === "deal-free-cookie")!;
    expect(cookie.title).toBe("Free cookie over $15");
    expect(cookie.code).toBe("FREECOOKIE");
    expect(cookie.appExclusive).toBe(true);
    expect(typeof cookie.startsAt).toBe("string");
    expect(typeof cookie.endsAt).toBe("string");
  });

  it("once the owner stores deals, the store wins (defaults no longer injected)", async () => {
    await overridesStore.put(env, {
      items: {},
      deals: {
        "deal-bogo": {
          dealId: "deal-bogo",
          title: "BOGO subs",
          description: "Buy one get one.",
          code: "BOGO",
        },
      },
    });
    const deals = await getDeals(env);
    expect(deals.map((d) => d.id)).toEqual(["deal-bogo"]);
  });
});

describe("getDeals — enabled flag + active window", () => {
  it("hides a disabled deal", async () => {
    await overridesStore.put(env, {
      items: {},
      deals: {
        "deal-off": { dealId: "deal-off", title: "Off", description: "x", enabled: false },
        "deal-on": { dealId: "deal-on", title: "On", description: "x", enabled: true },
      },
    });
    const deals = await getDeals(env);
    expect(deals.map((d) => d.id)).toEqual(["deal-on"]);
  });

  it("hides a deal whose window has not started or has ended", async () => {
    await overridesStore.put(env, {
      items: {},
      deals: {
        "deal-future": { dealId: "deal-future", title: "Soon", description: "x", startsAt: FUTURE },
        "deal-expired": { dealId: "deal-expired", title: "Gone", description: "x", endsAt: PAST },
        "deal-live": { dealId: "deal-live", title: "Now", description: "x", startsAt: PAST, endsAt: FUTURE },
      },
    });
    const deals = await getDeals(env);
    expect(deals.map((d) => d.id)).toEqual(["deal-live"]);
  });
});

describe("getApplicableDealOverride", () => {
  it("returns an enabled, in-window deal", async () => {
    const found = await getApplicableDealOverride(env, "deal-free-cookie"); // from defaults
    expect(found?.dealId).toBe("deal-free-cookie");
  });

  it("returns undefined for a disabled deal", async () => {
    await overridesStore.put(env, {
      items: {},
      deals: { "deal-off": { dealId: "deal-off", title: "Off", description: "x", enabled: false } },
    });
    expect(await getApplicableDealOverride(env, "deal-off")).toBeUndefined();
  });

  it("returns undefined for an unknown deal id", async () => {
    expect(await getApplicableDealOverride(env, "nope")).toBeUndefined();
  });
});

describe("dealDiscountCents — discount driven by the override spec", () => {
  const freeCookie = defaultDealOverrides()["deal-free-cookie"];
  const doubleStars = defaultDealOverrides()["deal-double-stars"];

  it("applies the free-item credit once the subtotal meets the floor", () => {
    expect(dealDiscountCents(freeCookie, 1500)).toBe(249);
    expect(dealDiscountCents(freeCookie, 5000)).toBe(249);
  });

  it("does not apply the free-item credit below the floor", () => {
    expect(dealDiscountCents(freeCookie, 1499)).toBe(0);
  });

  it("doubleStars deals never discount the total", () => {
    expect(dealDiscountCents(doubleStars, 10_000)).toBe(0);
  });

  it("a deal with no discount spec yields 0", () => {
    const informational: DealOverride = { dealId: "d", title: "t", description: "x" };
    expect(dealDiscountCents(informational, 10_000)).toBe(0);
  });

  it("amountOff knocks a fixed amount off (capped at the subtotal)", () => {
    const amt: DealOverride = {
      dealId: "d",
      title: "$5 off",
      description: "x",
      discount: { kind: "amountOff", amountCents: 500 },
    };
    expect(dealDiscountCents(amt, 2000)).toBe(500);
    expect(dealDiscountCents(amt, 300)).toBe(300); // never more than subtotal
  });

  it("amountOff honors an optional minSubtotal floor", () => {
    const amt: DealOverride = {
      dealId: "d",
      title: "$5 off $20",
      description: "x",
      discount: { kind: "amountOff", amountCents: 500, minSubtotalCents: 2000 },
    };
    expect(dealDiscountCents(amt, 1999)).toBe(0);
    expect(dealDiscountCents(amt, 2000)).toBe(500);
  });
});
