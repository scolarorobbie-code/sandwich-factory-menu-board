/**
 * mirror-catalog.mjs — copy your REAL menu from production Square into the
 * sandbox, so the test app shows YOUR actual items, prices, sizes and toppings.
 *
 * SAFETY: this only READS your production catalog (GET). It NEVER writes to or
 * changes your real Square account. It only writes into the sandbox (practice).
 *
 * Setup (all on your Mac, nothing leaves it):
 *   1) services/backend/.dev.vars must have your SANDBOX token already
 *      (SQUARE_ACCESS_TOKEN=...).
 *   2) Add your PRODUCTION access token on a new line:
 *      SQUARE_PRODUCTION_ACCESS_TOKEN=EAAA...   (from the Production tab)
 *   3) npm run mirror-catalog
 *   4) Delete the SQUARE_PRODUCTION_ACCESS_TOKEN line again when done (optional;
 *      it's only needed for this one-time copy).
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const DEV_VARS = resolve(HERE, "..", ".dev.vars");
const API_VERSION = "2026-01-22";
const PROD = "https://connect.squareup.com";
const SANDBOX = "https://connect.squareupsandbox.com";

function fail(msg) {
  console.error(`\n❌ ${msg}\n`);
  process.exit(1);
}

function readVars() {
  if (!existsSync(DEV_VARS)) fail("No services/backend/.dev.vars found.");
  const v = {};
  for (const line of readFileSync(DEV_VARS, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m) v[m[1]] = m[2];
  }
  return v;
}

async function sq(host, token, path, init = {}) {
  const res = await fetch(`${host}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Square-Version": API_VERSION,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = body?.errors?.[0]?.detail ?? JSON.stringify(body);
    fail(`Square ${res.status} on ${path}: ${detail}`);
  }
  return body;
}

const vars = readVars();
const prodToken = vars.SQUARE_PRODUCTION_ACCESS_TOKEN;
const sandboxToken = vars.SQUARE_ACCESS_TOKEN;
if (!prodToken || prodToken.length < 10) {
  fail(
    "Add your PRODUCTION access token to services/backend/.dev.vars:\n   SQUARE_PRODUCTION_ACCESS_TOKEN=EAAA...\n(Production tab -> Credentials -> Access token. Read-only use; stays on your Mac.)",
  );
}
if (!sandboxToken || sandboxToken.length < 10) fail("SQUARE_ACCESS_TOKEN (sandbox) missing in .dev.vars.");

const tempId = (id) => `#${id}`;

// 1) Pull the full production catalog (read-only).
console.log("📥 Reading your real menu from production Square (read-only)…");
const prodObjects = [];
let cursor;
do {
  const qs = `types=ITEM,CATEGORY,MODIFIER_LIST${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
  const page = await sq(PROD, prodToken, `/v2/catalog/list?${qs}`);
  prodObjects.push(...(page.objects ?? []));
  cursor = page.cursor;
} while (cursor);

const categories = prodObjects.filter((o) => o.type === "CATEGORY");
const modifierLists = prodObjects.filter((o) => o.type === "MODIFIER_LIST");
const items = prodObjects.filter((o) => o.type === "ITEM" && !o.is_deleted);
console.log(`   Found ${items.length} items, ${categories.length} categories, ${modifierLists.length} modifier lists.`);
if (items.length === 0) fail("No items found in your production catalog. Is this the right Square account?");

const categoryIds = new Set(categories.map((c) => c.id));
const modifierListIds = new Set(modifierLists.map((m) => m.id));

// 2) Build sanitized objects with stable temp ids (strip env-specific fields).
const upserts = [];

for (const c of categories) {
  upserts.push({ type: "CATEGORY", id: tempId(c.id), category_data: { name: c.category_data?.name ?? "Category" } });
}

for (const ml of modifierLists) {
  upserts.push({
    type: "MODIFIER_LIST",
    id: tempId(ml.id),
    modifier_list_data: {
      name: ml.modifier_list_data?.name ?? "Options",
      selection_type: ml.modifier_list_data?.selection_type ?? "SINGLE",
      modifiers: (ml.modifier_list_data?.modifiers ?? []).map((m) => ({
        type: "MODIFIER",
        id: tempId(m.id),
        modifier_data: {
          name: m.modifier_data?.name ?? "Option",
          price_money: m.modifier_data?.price_money,
          on_by_default: m.modifier_data?.on_by_default,
        },
      })),
    },
  });
}

for (const it of items) {
  const d = it.item_data ?? {};
  // Resolve category from any of Square's shapes, only if we mirrored it.
  const rawCat = d.reporting_category?.id ?? d.categories?.[0]?.id ?? d.category_id;
  const category_id = rawCat && categoryIds.has(rawCat) ? tempId(rawCat) : undefined;

  upserts.push({
    type: "ITEM",
    id: tempId(it.id),
    item_data: {
      name: d.name ?? "Item",
      description: d.description,
      category_id,
      variations: (d.variations ?? [])
        .filter((v) => !v.is_deleted)
        .map((v) => ({
          type: "ITEM_VARIATION",
          id: tempId(v.id),
          item_variation_data: {
            item_id: tempId(it.id),
            name: v.item_variation_data?.name ?? "Regular",
            pricing_type: v.item_variation_data?.pricing_type ?? "FIXED_PRICING",
            price_money: v.item_variation_data?.price_money,
          },
        })),
      modifier_list_info: (d.modifier_list_info ?? [])
        .filter((mli) => modifierListIds.has(mli.modifier_list_id))
        .map((mli) => ({
          modifier_list_id: tempId(mli.modifier_list_id),
          enabled: mli.enabled !== false,
          min_selected_modifiers: mli.min_selected_modifiers,
          max_selected_modifiers: mli.max_selected_modifiers,
        })),
    },
  });
}

// 3) Clear whatever is currently in the sandbox catalog (the seeded test items).
console.log("🧹 Clearing the old test items from the sandbox…");
const existing = [];
let scursor;
do {
  const qs = `types=ITEM,CATEGORY,MODIFIER_LIST,IMAGE${scursor ? `&cursor=${encodeURIComponent(scursor)}` : ""}`;
  const page = await sq(SANDBOX, sandboxToken, `/v2/catalog/list?${qs}`);
  existing.push(...(page.objects ?? []).map((o) => o.id));
  scursor = page.cursor;
} while (scursor);
if (existing.length) {
  for (let i = 0; i < existing.length; i += 200) {
    await sq(SANDBOX, sandboxToken, "/v2/catalog/batch-delete", {
      method: "POST",
      body: JSON.stringify({ object_ids: existing.slice(i, i + 200) }),
    });
  }
}

// 4) Write your real menu into the sandbox. Square counts NESTED objects
//    (each variation, each modifier) toward the 1000-per-batch limit, and
//    cross-references must resolve within ONE request — so we pack everything
//    into one request split into multiple batches, each <= ~900 total objects.
console.log(`📤 Copying ${items.length} items into the sandbox…`);

const weight = (o) =>
  o.type === "ITEM"
    ? 1 + (o.item_data?.variations?.length ?? 0)
    : o.type === "MODIFIER_LIST"
      ? 1 + (o.modifier_list_data?.modifiers?.length ?? 0)
      : 1;

const batches = [];
let current = [];
let currentWeight = 0;
for (const obj of upserts) {
  const w = weight(obj);
  if (current.length && currentWeight + w > 900) {
    batches.push({ objects: current });
    current = [];
    currentWeight = 0;
  }
  current.push(obj);
  currentWeight += w;
}
if (current.length) batches.push({ objects: current });

await sq(SANDBOX, sandboxToken, "/v2/catalog/batch-upsert", {
  method: "POST",
  body: JSON.stringify({ idempotency_key: `mirror-${Date.now()}`, batches }),
});

console.log(`
🎉 Done! Your real menu is now in the sandbox.
   • ${items.length} items copied (prices, sizes, and toppings included).
   • Photos are not copied yet — that's a separate step.
   • Restart the backend and reload the app to see YOUR menu.
`);
