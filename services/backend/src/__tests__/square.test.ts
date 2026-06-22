import { describe, expect, it } from "vitest";
import {
  cleanName,
  leadingNumber,
  mapModifierGroups,
  placeholderImage,
  type SquareModifierListInfo,
  type SquareObject,
} from "../square";

describe("leadingNumber", () => {
  it("reads the leading integer used to force group order", () => {
    expect(leadingNumber("1. Bread")).toBe(1);
    expect(leadingNumber("10) Toppings")).toBe(10);
    expect(leadingNumber("  3 - Sauce")).toBe(3);
  });

  it("sorts unnumbered names last", () => {
    expect(leadingNumber("Cheese")).toBe(Number.MAX_SAFE_INTEGER);
  });
});

describe("cleanName", () => {
  it("strips a leading number + separator for display", () => {
    expect(cleanName("1. Bread")).toBe("Bread");
    expect(cleanName("2) Toppings")).toBe("Toppings");
    expect(cleanName("3 - Sauce")).toBe("Sauce");
    expect(cleanName("4: Drink")).toBe("Drink");
  });

  it("leaves an unprefixed name untouched", () => {
    expect(cleanName("Choose your bread")).toBe("Choose your bread");
  });

  it("falls back to the original when stripping would empty it", () => {
    expect(cleanName("12.")).toBe("12.");
  });
});

// --- mapModifierGroups -----------------------------------------------------

function modList(
  id: string,
  name: string,
  selectionType: "SINGLE" | "MULTIPLE",
  modifiers: { id: string; name: string; ordinal?: number; price?: number }[],
): SquareObject {
  return {
    id,
    type: "MODIFIER_LIST",
    modifier_list_data: {
      name,
      selection_type: selectionType,
      modifiers: modifiers.map((m) => ({
        id: m.id,
        type: "MODIFIER",
        modifier_data: { name: m.name, ordinal: m.ordinal, price_money: { amount: m.price ?? 0 } },
      })),
    },
  };
}

describe("mapModifierGroups", () => {
  it("orders groups by the leading number in their name and strips it", () => {
    const lists = new Map<string, SquareObject>([
      ["mg-2", modList("mg-2", "2. Toppings", "MULTIPLE", [{ id: "t1", name: "Lettuce" }])],
      ["mg-1", modList("mg-1", "1. Bread", "SINGLE", [{ id: "b1", name: "White" }])],
      ["mg-3", modList("mg-3", "3. Sauce", "MULTIPLE", [{ id: "s1", name: "Mayo" }])],
    ]);
    // info order is intentionally scrambled; output must follow the name number.
    const info: SquareModifierListInfo[] = [
      { modifier_list_id: "mg-3" },
      { modifier_list_id: "mg-1" },
      { modifier_list_id: "mg-2" },
    ];
    const groups = mapModifierGroups(info, lists);
    expect(groups.map((g) => g.name)).toEqual(["Bread", "Toppings", "Sauce"]);
  });

  it("falls back to Square ordinal when names share (or lack) a number", () => {
    const lists = new Map<string, SquareObject>([
      ["a", modList("a", "Extras", "MULTIPLE", [{ id: "x", name: "X" }])],
      ["b", modList("b", "Add-ons", "MULTIPLE", [{ id: "y", name: "Y" }])],
    ]);
    const info: SquareModifierListInfo[] = [
      { modifier_list_id: "a", ordinal: 5 },
      { modifier_list_id: "b", ordinal: 1 },
    ];
    const groups = mapModifierGroups(info, lists);
    expect(groups.map((g) => g.id)).toEqual(["b", "a"]); // lower ordinal first
  });

  it("sorts modifiers within a group by their Square ordinal", () => {
    const lists = new Map<string, SquareObject>([
      [
        "mg",
        modList("mg", "Bread", "SINGLE", [
          { id: "c", name: "Wheat", ordinal: 2 },
          { id: "a", name: "White", ordinal: 0 },
          { id: "b", name: "Herb", ordinal: 1 },
        ]),
      ],
    ]);
    const groups = mapModifierGroups([{ modifier_list_id: "mg" }], lists);
    expect(groups[0].modifiers.map((m) => m.name)).toEqual(["White", "Herb", "Wheat"]);
  });

  it("defaults SINGLE selection to max 1, MULTIPLE to the modifier count", () => {
    const lists = new Map<string, SquareObject>([
      ["single", modList("single", "Bread", "SINGLE", [{ id: "a", name: "A" }, { id: "b", name: "B" }])],
      [
        "multi",
        modList("multi", "Extras", "MULTIPLE", [
          { id: "c", name: "C" },
          { id: "d", name: "D" },
          { id: "e", name: "E" },
        ]),
      ],
    ]);
    const single = mapModifierGroups([{ modifier_list_id: "single" }], lists)[0];
    const multi = mapModifierGroups([{ modifier_list_id: "multi" }], lists)[0];
    expect(single.minSelections).toBe(0);
    expect(single.maxSelections).toBe(1); // single-select default
    expect(multi.maxSelections).toBe(3); // = modifier count
  });

  it("honors explicit min/max from the item's modifier_list_info", () => {
    const lists = new Map<string, SquareObject>([
      ["mg", modList("mg", "Bread", "SINGLE", [{ id: "a", name: "A" }, { id: "b", name: "B" }])],
    ]);
    const group = mapModifierGroups(
      [{ modifier_list_id: "mg", min_selected_modifiers: 1, max_selected_modifiers: 2 }],
      lists,
    )[0];
    expect(group.minSelections).toBe(1);
    expect(group.maxSelections).toBe(2);
  });

  it("skips disabled modifier-list references", () => {
    const lists = new Map<string, SquareObject>([
      ["mg", modList("mg", "Bread", "SINGLE", [{ id: "a", name: "A" }])],
    ]);
    const groups = mapModifierGroups([{ modifier_list_id: "mg", enabled: false }], lists);
    expect(groups).toEqual([]);
  });
});

describe("placeholderImage", () => {
  it("picks an on-theme keyword from the item name", () => {
    expect(placeholderImage("Classic Burger", "seed")).toContain("burger");
    expect(placeholderImage("Oreo Milkshake", "seed")).toContain("milkshake");
    expect(placeholderImage("Fresh Baked Cookie", "seed")).toContain("cookie");
    expect(placeholderImage("Fountain Drink", "seed")).toContain("soda");
    expect(placeholderImage("Italian Sub", "seed")).toContain("sandwich");
  });

  it("is deterministic for the same seed", () => {
    expect(placeholderImage("Italian Sub", "item-123")).toBe(placeholderImage("Italian Sub", "item-123"));
  });
});
