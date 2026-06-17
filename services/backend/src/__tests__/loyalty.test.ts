import type { LoyaltyReward } from "@sf/contract";
import { describe, expect, it } from "vitest";
import { bestAffordableReward } from "../loyalty";

const usd = (cents: number) => ({ amount: cents, currency: "USD" as const });

const TIERS: LoyaltyReward[] = [
  { id: "r5", name: "$5 off", cost: 50, value: usd(500) },
  { id: "r10", name: "$10 off", cost: 100, value: usd(1000) },
  { id: "r20", name: "$20 off", cost: 200, value: usd(2000) },
];

describe("bestAffordableReward", () => {
  it("picks the highest tier the balance covers", () => {
    // Balance covers $5 and $10 but not $20 -> pick $10.
    const r = bestAffordableReward(TIERS, 150, 1000);
    expect(r?.id).toBe("r10");
  });

  it("picks the single tier exactly affordable", () => {
    const r = bestAffordableReward(TIERS, 50, 1000);
    expect(r?.id).toBe("r5");
  });

  it("picks the top tier when the balance covers everything", () => {
    const r = bestAffordableReward(TIERS, 10000, 10000);
    expect(r?.id).toBe("r20");
  });

  it("returns null when the balance is below the cheapest tier", () => {
    expect(bestAffordableReward(TIERS, 49, 1000)).toBeNull();
  });

  it("respects the redeem cap (what the customer chose to spend)", () => {
    // Balance covers $20, but the customer only authorized 100 Stars -> $10.
    const r = bestAffordableReward(TIERS, 1000, 100);
    expect(r?.id).toBe("r10");
  });

  it("returns null when the cap is below the cheapest tier", () => {
    expect(bestAffordableReward(TIERS, 1000, 49)).toBeNull();
  });

  it("ignores zero-cost tiers", () => {
    const withFree: LoyaltyReward[] = [{ id: "free", name: "Free", cost: 0, value: usd(0) }, ...TIERS];
    const r = bestAffordableReward(withFree, 60, 60);
    expect(r?.id).toBe("r5");
  });

  it("returns null for an empty reward list", () => {
    expect(bestAffordableReward([], 1000, 1000)).toBeNull();
  });
});
