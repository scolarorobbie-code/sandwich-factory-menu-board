import { describe, expect, it } from "vitest";
import { palette } from "../palette";
import { colors, dollars, money } from "../theme";

/**
 * theme.ts derives `colors` 1:1 from the brand palette (the single source of
 * truth). This guards the contract: every color key maps straight through, so a
 * palette edit propagates to every screen without theme.ts drifting.
 */
describe("brand → theme palette mapping", () => {
  it("derives every color key 1:1 from the palette", () => {
    expect(colors).toEqual({
      bg: palette.bg,
      bg2: palette.bg2,
      card: palette.card,
      line: palette.line,
      accent: palette.accent,
      accent2: palette.accent2,
      text: palette.text,
      muted: palette.muted,
      cyan: palette.cyan,
    });
  });

  it("exposes exactly the palette's keys (no extra/missing keys)", () => {
    expect(Object.keys(colors).sort()).toEqual(Object.keys(palette).sort());
  });

  it("carries the Sandwich Factory brand red as the accent", () => {
    expect(colors.accent).toBe("#c0392b");
  });
});

describe("money formatting", () => {
  it("formats a Money value in dollars from cents", () => {
    expect(money({ amount: 899, currency: "USD" })).toBe("$8.99");
  });

  it("formats a raw cents amount", () => {
    expect(dollars(2997)).toBe("$29.97");
    expect(dollars(0)).toBe("$0.00");
  });
});
