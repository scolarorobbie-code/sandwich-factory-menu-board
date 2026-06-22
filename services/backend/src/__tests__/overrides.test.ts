import type { ConditionalRule, Menu, MenuOverrides } from "@sf/contract";
import { describe, expect, it } from "vitest";
import { applyOverrides } from "../overrides";

const usd = (cents: number) => ({ amount: cents, currency: "USD" as const });

function baseMenu(): Menu {
  return {
    version: "test",
    fetchedAt: "2026-01-01T00:00:00.000Z",
    categories: [
      {
        id: "cat",
        name: "Subs",
        ordinal: 0,
        items: [
          {
            id: "item-a",
            name: "Sub A",
            available: true,
            variations: [{ id: "var-a", name: "Regular", price: usd(700), available: true }],
            modifierGroups: [
              {
                id: "grp-bread",
                name: "Bread",
                minSelections: 0,
                maxSelections: 3,
                modifiers: [{ id: "m1", name: "White", price: usd(0), available: true }],
              },
            ],
          },
          {
            id: "item-b",
            name: "Sub B",
            available: true,
            variations: [{ id: "var-b", name: "Regular", price: usd(800), available: true }],
            modifierGroups: [],
          },
        ],
      },
    ],
  };
}

function overrides(items: MenuOverrides["items"]): MenuOverrides {
  return { items, deals: {}, updatedAt: "2026-01-01T00:00:00.000Z" };
}

describe("applyOverrides", () => {
  it("returns the menu unchanged when there are no item overrides", () => {
    const menu = baseMenu();
    const out = applyOverrides(menu, overrides({}));
    expect(out).toBe(menu); // same reference, fast path
  });

  it("drops hidden items entirely", () => {
    const out = applyOverrides(baseMenu(), overrides({ "item-a": { itemId: "item-a", hidden: true } }));
    const ids = out.categories[0].items.map((i) => i.id);
    expect(ids).toEqual(["item-b"]);
  });

  it("forces sold-out items to unavailable", () => {
    const out = applyOverrides(baseMenu(), overrides({ "item-a": { itemId: "item-a", soldOut: true } }));
    expect(out.categories[0].items.find((i) => i.id === "item-a")!.available).toBe(false);
  });

  it("never re-enables an item Square already marked unavailable", () => {
    const menu = baseMenu();
    menu.categories[0].items[0].available = false; // Square inventory already off
    const out = applyOverrides(menu, overrides({ "item-a": { itemId: "item-a", soldOut: false } }));
    expect(out.categories[0].items[0].available).toBe(false);
  });

  it("clamps min/max from required:true", () => {
    const out = applyOverrides(
      baseMenu(),
      overrides({ "item-a": { itemId: "item-a", groups: [{ groupId: "grp-bread", required: true }] } }),
    );
    const grp = out.categories[0].items[0].modifierGroups[0];
    expect(grp.minSelections).toBe(1); // max(1, original 0)
    expect(grp.maxSelections).toBe(3); // unchanged
  });

  it("applies explicit min/max and keeps max >= min", () => {
    const out = applyOverrides(
      baseMenu(),
      overrides({
        "item-a": {
          itemId: "item-a",
          groups: [{ groupId: "grp-bread", minSelections: 2, maxSelections: 1 }],
        },
      }),
    );
    const grp = out.categories[0].items[0].modifierGroups[0];
    expect(grp.minSelections).toBe(2);
    expect(grp.maxSelections).toBe(2); // raised to >= min, never below
  });

  it("required:false forces min to 0", () => {
    const menu = baseMenu();
    menu.categories[0].items[0].modifierGroups[0].minSelections = 1;
    const out = applyOverrides(
      menu,
      overrides({ "item-a": { itemId: "item-a", groups: [{ groupId: "grp-bread", required: false }] } }),
    );
    expect(out.categories[0].items[0].modifierGroups[0].minSelections).toBe(0);
  });

  it("promotes a conditional rule onto the contract `conditional` field", () => {
    const rule: ConditionalRule = {
      hiddenUntilTriggered: true,
      triggerModifierIds: ["combo-mod"],
    };
    const out = applyOverrides(
      baseMenu(),
      overrides({ "item-a": { itemId: "item-a", groups: [{ groupId: "grp-bread", conditional: rule }] } }),
    );
    const grp = out.categories[0].items[0].modifierGroups[0];
    expect(grp.conditional).toEqual(rule);
  });

  it("does not mutate the input menu (pure)", () => {
    const menu = baseMenu();
    const snapshot = structuredClone(menu);
    applyOverrides(
      menu,
      overrides({
        "item-a": {
          itemId: "item-a",
          soldOut: true,
          groups: [{ groupId: "grp-bread", required: true, conditional: { hiddenUntilTriggered: true } }],
        },
        "item-b": { itemId: "item-b", hidden: true },
      }),
    );
    expect(menu).toEqual(snapshot);
  });
});
