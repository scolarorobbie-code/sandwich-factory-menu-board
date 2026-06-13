import type { Menu, MenuCategory, MenuItem, ModifierGroup, Money } from "@sf/contract";
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
 * Fetch the live catalog and map it into our contract `Menu`.
 *
 * NOTE: this maps the common shape of Square's `catalog/list` /
 * `catalog/search-catalog-objects` response (ITEM / ITEM_VARIATION /
 * CATEGORY / MODIFIER_LIST). It is intentionally defensive — once real sandbox
 * data is connected we tighten the field mapping against the actual payload.
 */
export async function fetchLiveMenu(env: Env): Promise<Menu> {
  const res = await squareFetch(
    env,
    "/v2/catalog/search-catalog-objects",
    {
      method: "POST",
      body: JSON.stringify({
        object_types: ["ITEM", "CATEGORY", "MODIFIER_LIST"],
        include_related_objects: true,
      }),
    },
  );

  if (!res.ok) {
    throw new Error(`Square catalog error ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as SquareCatalogResponse;
  const objects = data.objects ?? [];
  const related = data.related_objects ?? [];

  const categories = new Map<string, MenuCategory>();
  for (const o of [...objects, ...related]) {
    if (o.type === "CATEGORY" && o.category_data) {
      categories.set(o.id, { id: o.id, name: o.category_data.name, ordinal: categories.size, items: [] });
    }
  }
  const uncategorized: MenuCategory = { id: "uncategorized", name: "Menu", ordinal: 999, items: [] };

  for (const o of objects) {
    if (o.type !== "ITEM" || !o.item_data) continue;
    const item = mapItem(o);
    const catId = o.item_data.category_id ?? o.item_data.categories?.[0]?.id;
    const cat = (catId && categories.get(catId)) || uncategorized;
    cat.items.push(item);
  }

  const result = [...categories.values(), uncategorized].filter((c) => c.items.length > 0);
  return {
    version: String(data.cursor ?? Date.now()),
    fetchedAt: new Date().toISOString(),
    categories: result.sort((a, b) => a.ordinal - b.ordinal),
  };
}

function mapItem(o: SquareObject): MenuItem {
  const d = o.item_data!;
  return {
    id: o.id,
    name: d.name ?? "Item",
    description: d.description,
    available: !o.is_deleted,
    variations: (d.variations ?? []).map((v) => ({
      id: v.id,
      name: v.item_variation_data?.name ?? "Regular",
      price: usd(v.item_variation_data?.price_money?.amount),
      available: !v.is_deleted,
    })),
    modifierGroups: mapModifierGroups(d.modifier_list_info ?? []),
  };
}

function mapModifierGroups(_info: SquareModifierListInfo[]): ModifierGroup[] {
  // Modifier lists arrive in related_objects; full resolution is wired in Phase 1
  // once we can inspect real sandbox payloads. Empty is a safe Phase 0 default.
  return [];
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
  item_data?: {
    name?: string;
    description?: string;
    category_id?: string;
    categories?: { id: string }[];
    variations?: SquareObject[];
    item_variation_data?: { name?: string; price_money?: { amount?: number } };
    modifier_list_info?: SquareModifierListInfo[];
  };
  item_variation_data?: { name?: string; price_money?: { amount?: number } };
}
interface SquareModifierListInfo {
  modifier_list_id: string;
}
