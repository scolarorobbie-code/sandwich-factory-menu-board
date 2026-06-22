/**
 * add-drink-set.mjs — make the "Choose Your Drink" picker show up on combos.
 *
 * The problem this fixes: when a customer picks "COMBO With Fries And A Drink"
 * we want a drink chooser (Coke, Sprite, …) to appear. Square stores that as a
 * separate MODIFIER_LIST that has to be ATTACHED to every item that offers a
 * combo. This script does that attachment for ALL combo items at once, so a
 * burger gets the same drink picker a sub does.
 *
 * Run from the Mac (token stays local, never committed):
 *   1) make sure SQUARE_ACCESS_TOKEN (sandbox) is in services/backend/.dev.vars
 *   2) npm run add-drink-set         (from the repo root)
 *
 * It is SAFE to run more than once — it never creates duplicates and only
 * attaches the drink list where it's missing. Sandbox only, no real money.
 *
 * How it decides:
 *   - "combo item"  = an item whose modifiers include a list named like
 *                     "Make It A Combo?" (matches /combo/i).
 *   - "drink list"  = an existing MODIFIER_LIST named like "...Drink"
 *                     (matches /drink/i but NOT /combo/i). If none exists, it
 *                     creates one named "Choose Your Drink" with fountain drinks.
 *
 * The app (ItemDetailScreen) keeps the drink picker hidden until a combo is
 * chosen, then reveals + requires it. So we attach it as pick-exactly-one.
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const DEV_VARS = resolve(HERE, "..", ".dev.vars");
const API_VERSION = "2026-01-22";
const HOST = "https://connect.squareupsandbox.com";

// Default fountain drinks used only if no drink list exists yet. Square stays
// the source of truth — the owner can rename/add/remove these in the dashboard.
const DEFAULT_DRINKS = [
  "Coca-Cola",
  "Diet Coke",
  "Coke Zero",
  "Sprite",
  "Dr Pepper",
  "Lemonade",
  "Sweet Tea",
  "Unsweet Tea",
  "Bottled Water",
];

function fail(msg) {
  console.error(`\n❌ ${msg}\n`);
  process.exit(1);
}

function readDevVars() {
  if (!existsSync(DEV_VARS)) {
    fail("No services/backend/.dev.vars found. Put your Sandbox Access Token in SQUARE_ACCESS_TOKEN= first.");
  }
  const vars = {};
  for (const line of readFileSync(DEV_VARS, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m) vars[m[1]] = m[2];
  }
  return vars;
}

const TOKEN = readDevVars().SQUARE_ACCESS_TOKEN;
if (!TOKEN || TOKEN.length < 10) {
  fail("SQUARE_ACCESS_TOKEN is empty in services/backend/.dev.vars. Paste your Sandbox Access Token there first.");
}

async function sq(path, init = {}) {
  const res = await fetch(`${HOST}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Square-Version": API_VERSION,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = body?.errors?.[0]?.detail ?? JSON.stringify(body);
    fail(`Square API ${res.status} on ${path}: ${detail}`);
  }
  return body;
}

/** Page through /v2/catalog/list for a given type, returning all objects. */
async function listAll(type) {
  const out = [];
  let cursor;
  do {
    const qs = `types=${type}` + (cursor ? `&cursor=${encodeURIComponent(cursor)}` : "");
    const page = await sq(`/v2/catalog/list?${qs}`);
    out.push(...(page.objects ?? []));
    cursor = page.cursor;
  } while (cursor);
  return out;
}

console.log("🥤 Setting up the combo drink picker…");

const [items, modifierLists] = await Promise.all([listAll("ITEM"), listAll("MODIFIER_LIST")]);
console.log(`   Found ${items.length} items and ${modifierLists.length} modifier lists.`);

// 1) Identify the combo list(s) and the drink list.
const isComboList = (m) => /combo/i.test(m.modifier_list_data?.name ?? "");
const isDrinkList = (m) => {
  const name = m.modifier_list_data?.name ?? "";
  return /drink/i.test(name) && !/combo/i.test(name);
};

const comboListIds = new Set(modifierLists.filter(isComboList).map((m) => m.id));
if (comboListIds.size === 0) {
  fail('No combo modifier list found (looking for a list named like "Make It A Combo?"). Nothing to attach a drink to.');
}

// Prefer an existing drink list (the one with the most options); else create one.
let drinkListId = modifierLists
  .filter(isDrinkList)
  .sort((a, b) => (b.modifier_list_data?.modifiers?.length ?? 0) - (a.modifier_list_data?.modifiers?.length ?? 0))[0]?.id;

if (drinkListId) {
  const dl = modifierLists.find((m) => m.id === drinkListId);
  console.log(`   Reusing existing drink list "${dl.modifier_list_data?.name}" (${dl.modifier_list_data?.modifiers?.length ?? 0} drinks).`);
} else {
  console.log('   No drink list yet — creating "Choose Your Drink"…');
  const created = await sq("/v2/catalog/batch-upsert", {
    method: "POST",
    body: JSON.stringify({
      idempotency_key: `drink-list-${Date.now()}`,
      batches: [
        {
          objects: [
            {
              type: "MODIFIER_LIST",
              id: "#choose-your-drink",
              modifier_list_data: {
                name: "Choose Your Drink",
                selection_type: "SINGLE",
                modifiers: DEFAULT_DRINKS.map((name, i) => ({
                  type: "MODIFIER",
                  id: `#drink-${i}`,
                  modifier_data: { name, price_money: { amount: 0, currency: "USD" }, ordinal: i },
                })),
              },
            },
          ],
        },
      ],
    }),
  });
  drinkListId = created.id_mappings?.find((m) => m.client_object_id === "#choose-your-drink")?.object_id;
  if (!drinkListId) fail("Could not read the new drink list id back from Square.");
  console.log(`   Created drink list ${drinkListId}.`);
}

// 2) Find combo items missing the drink list, and attach it (pick exactly 1).
const toUpdate = [];
for (const item of items) {
  const info = item.item_data?.modifier_list_info ?? [];
  const offersCombo = info.some((i) => comboListIds.has(i.modifier_list_id));
  if (!offersCombo) continue;
  const alreadyHasDrink = info.some((i) => i.modifier_list_id === drinkListId);
  if (alreadyHasDrink) continue;

  // Put the drink picker right after the combo group so it reads naturally.
  const maxOrdinal = Math.max(0, ...info.map((i) => i.ordinal ?? 0));
  const updated = {
    ...item,
    item_data: {
      ...item.item_data,
      modifier_list_info: [
        ...info,
        {
          modifier_list_id: drinkListId,
          enabled: true,
          min_selected_modifiers: 1, // app reveals + requires it only after a combo is picked
          max_selected_modifiers: 1,
          ordinal: maxOrdinal + 1,
        },
      ],
    },
  };
  toUpdate.push(updated);
}

if (toUpdate.length === 0) {
  console.log("\n✅ Every combo item already has the drink picker. Nothing to do.\n");
  process.exit(0);
}

console.log(`   Attaching the drink picker to ${toUpdate.length} combo item(s)…`);

// 3) Upsert in safe-sized batches (Square caps at 1000 objects per request).
const CHUNK = 200;
for (let i = 0; i < toUpdate.length; i += CHUNK) {
  const slice = toUpdate.slice(i, i + CHUNK);
  await sq("/v2/catalog/batch-upsert", {
    method: "POST",
    body: JSON.stringify({
      idempotency_key: `attach-drinks-${Date.now()}-${i}`,
      batches: [{ objects: slice }],
    }),
  });
  console.log(`   …updated ${Math.min(i + CHUNK, toUpdate.length)}/${toUpdate.length}`);
}

console.log(`
🎉 Done! The drink picker is now attached to ${toUpdate.length} combo item(s).
   Restart the backend if it's running (Ctrl+C → npm run backend:dev), then
   reload the app (⌘R). Pick a combo → "Choose Your Drink" should appear.
`);
