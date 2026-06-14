import type { Menu, MenuCategory, MenuItem, Modifier, ModifierGroup, Money } from "@sf/contract";
import type { Env } from "./env";

const SQUARE_HOSTS = {
  sandbox: "https://connect.squareupsandbox.com",
  production: "https://connect.squareup.com",
};

/** Thin Square Connect API client. Lives ONLY on the backend (hard rule #1). */
export function squareFetch(env: Env, path: string, init: RequestInit = {}): Promise<Response> {
  const base = SQUARE_HOSTS[env.SQUARE_ENVIRONMENT];
  return fetch(`${base}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.SQUARE_ACCESS_TOKEN}`,
      "Square-Version": env.SQUARE_API_VERSION,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

const usd = (cents: number | bigint | undefined): Money => ({
  amount: Number(cents ?? 0),
  currency: "USD",
});

/**
 * Fetch the live menu from Square Catalog and map it into our contract `Menu`,
 * exactly like Orda does: items, variations, prices, modifier groups, PHOTOS,
 * and live "sold out" availability from Square Inventory.
 */
export async function fetchLiveMenu(env: Env): Promise<Menu> {
  const res = await squareFetch(env, "/v2/catalog/search-catalog-objects", {
    method: "POST",
    body: JSON.stringify({
      object_types: ["ITEM", "CATEGORY", "MODIFIER_LIST", "IMAGE"],
      include_related_objects: true,
    }),
  });
  if (!res.ok) {
    throw new Error(`Square catalog error ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as SquareCatalogResponse;
  const all = [...(data.objects ?? []), ...(data.related_objects ?? [])];

  // Lookup maps from related objects.
  const imageUrls = new Map<string, string>();
  const modifierLists = new Map<string, SquareObject>();
  const categories = new Map<string, MenuCategory>();
  for (const o of all) {
    if (o.type === "IMAGE" && o.image_data?.url) imageUrls.set(o.id, o.image_data.url);
    if (o.type === "MODIFIER_LIST") modifierLists.set(o.id, o);
    if (o.type === "CATEGORY" && o.category_data) {
      categories.set(o.id, { id: o.id, name: o.category_data.name, ordinal: categories.size, items: [] });
    }
  }

  const uncategorized: MenuCategory = { id: "uncategorized", name: "Menu", ordinal: 999, items: [] };
  const variationIds: string[] = [];

  for (const o of data.objects ?? []) {
    if (o.type !== "ITEM" || !o.item_data) continue;
    const item = mapItem(o, imageUrls, modifierLists);
    item.variations.forEach((v) => variationIds.push(v.id));
    const catId = o.item_data.category_id ?? o.item_data.categories?.[0]?.id;
    const cat = (catId && categories.get(catId)) || uncategorized;
    cat.items.push(item);
  }

  const result = [...categories.values(), uncategorized].filter((c) => c.items.length > 0);

  // Live stock: mark sold-out variations/items from Square Inventory.
  await applyInventory(env, variationIds, result);

  return {
    version: String(data.cursor ?? Date.now()),
    fetchedAt: new Date().toISOString(),
    categories: result.sort((a, b) => a.ordinal - b.ordinal),
  };
}

function mapItem(
  o: SquareObject,
  imageUrls: Map<string, string>,
  modifierLists: Map<string, SquareObject>,
): MenuItem {
  const d = o.item_data!;
  const imageId = d.image_ids?.[0];
  return {
    id: o.id,
    name: d.name ?? "Item",
    description: d.description,
    imageUrl: imageId ? imageUrls.get(imageId) : undefined,
    available: !o.is_deleted,
    variations: (d.variations ?? []).map((v) => ({
      id: v.id,
      name: v.item_variation_data?.name ?? "Regular",
      price: usd(v.item_variation_data?.price_money?.amount),
      available: !v.is_deleted,
    })),
    modifierGroups: mapModifierGroups(d.modifier_list_info ?? [], modifierLists),
  };
}

function mapModifierGroups(
  info: SquareModifierListInfo[],
  modifierLists: Map<string, SquareObject>,
): ModifierGroup[] {
  const groups: ModifierGroup[] = [];
  for (const ref of info) {
    if (ref.enabled === false) continue;
    const list = modifierLists.get(ref.modifier_list_id);
    const ld = list?.modifier_list_data;
    if (!ld) continue;
    const single = ld.selection_type === "SINGLE";
    const modifiers: Modifier[] = (ld.modifiers ?? []).map((m) => ({
      id: m.id,
      name: m.modifier_data?.name ?? "Option",
      price: usd(m.modifier_data?.price_money?.amount),
      available: !m.is_deleted,
      selectedByDefault: m.modifier_data?.on_by_default,
    }));
    groups.push({
      id: ref.modifier_list_id,
      name: ld.name ?? "Options",
      minSelections: ref.min_selected_modifiers ?? 0,
      maxSelections: ref.max_selected_modifiers ?? (single ? 1 : modifiers.length),
      modifiers,
    });
  }
  return groups;
}

/** Mark variations sold out when Square Inventory reports zero on-hand. */
async function applyInventory(env: Env, variationIds: string[], categories: MenuCategory[]): Promise<void> {
  if (variationIds.length === 0) return;
  try {
    const res = await squareFetch(env, "/v2/inventory/counts/batch-retrieve", {
      method: "POST",
      body: JSON.stringify({ catalog_object_ids: variationIds, location_ids: [env.SQUARE_LOCATION_ID] }),
    });
    if (!res.ok) return; // inventory not critical; fail open (treat as available)
    const data = (await res.json()) as { counts?: { catalog_object_id: string; state: string; quantity: string }[] };
    const soldOut = new Set<string>();
    for (const c of data.counts ?? []) {
      if (c.state === "IN_STOCK" && Number(c.quantity) <= 0) soldOut.add(c.catalog_object_id);
    }
    if (soldOut.size === 0) return;
    for (const cat of categories) {
      for (const item of cat.items) {
        for (const v of item.variations) if (soldOut.has(v.id)) v.available = false;
        if (item.variations.length > 0 && item.variations.every((v) => !v.available)) item.available = false;
      }
    }
  } catch {
    // Network/inventory issues should never break the menu — fail open.
  }
}

// ---------------------------------------------------------------------------
// Orders: push a real PICKUP order into Square (lands in POS, prints).
// ---------------------------------------------------------------------------

export interface SquareLineItem {
  catalogObjectId: string; // the variation id
  quantity: number;
  modifierIds: string[];
  note?: string;
}

export interface SquareOrderResult {
  squareOrderId: string;
  subtotal: Money;
  tax: Money;
  discount: Money;
  total: Money;
}

/**
 * Create an order in Square via the Orders API. Square computes tax/pricing
 * authoritatively from the catalog + location settings. The order is created
 * as PICKUP so it appears correctly in the existing Square POS.
 */
export async function createSquareOrder(
  env: Env,
  lineItems: SquareLineItem[],
  idempotencyKey: string,
  customerName: string,
  pickupNote?: string,
): Promise<SquareOrderResult> {
  const res = await squareFetch(env, "/v2/orders", {
    method: "POST",
    body: JSON.stringify({
      idempotency_key: idempotencyKey,
      order: {
        location_id: env.SQUARE_LOCATION_ID,
        line_items: lineItems.map((l) => ({
          quantity: String(l.quantity),
          catalog_object_id: l.catalogObjectId,
          modifiers: l.modifierIds.map((id) => ({ catalog_object_id: id })),
          note: l.note,
        })),
        fulfillments: [
          {
            type: "PICKUP",
            state: "PROPOSED",
            pickup_details: {
              schedule_type: "ASAP",
              recipient: { display_name: customerName },
              note: pickupNote,
            },
          },
        ],
      },
    }),
  });
  if (!res.ok) {
    throw new Error(`Square order error ${res.status}: ${await res.text()}`);
  }
  const { order } = (await res.json()) as {
    order?: {
      id: string;
      total_money?: { amount?: number };
      total_tax_money?: { amount?: number };
      total_discount_money?: { amount?: number };
      net_amounts?: { total_money?: { amount?: number } };
    };
  };
  const tax = order?.total_tax_money?.amount ?? 0;
  const discount = order?.total_discount_money?.amount ?? 0;
  const total = order?.total_money?.amount ?? 0;
  return {
    squareOrderId: order?.id ?? "",
    subtotal: usd(total - tax + discount),
    tax: usd(tax),
    discount: usd(discount),
    total: usd(total),
  };
}

// --- Minimal Square response shapes (only the fields we read) ---
interface SquareCatalogResponse {
  objects?: SquareObject[];
  related_objects?: SquareObject[];
  cursor?: string;
}
interface SquareObject {
  id: string;
  type: string;
  is_deleted?: boolean;
  category_data?: { name: string };
  image_data?: { url?: string };
  modifier_list_data?: {
    name?: string;
    selection_type?: string;
    modifiers?: SquareObject[];
  };
  modifier_data?: { name?: string; price_money?: { amount?: number }; on_by_default?: boolean };
  item_data?: {
    name?: string;
    description?: string;
    category_id?: string;
    categories?: { id: string }[];
    image_ids?: string[];
    variations?: SquareObject[];
    modifier_list_info?: SquareModifierListInfo[];
  };
  item_variation_data?: { name?: string; price_money?: { amount?: number } };
}
interface SquareModifierListInfo {
  modifier_list_id: string;
  enabled?: boolean;
  min_selected_modifiers?: number;
  max_selected_modifiers?: number;
}
