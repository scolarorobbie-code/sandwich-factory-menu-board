/**
 * connect-square.mjs — one-command Square sandbox setup.
 *
 * Run from the Mac (token stays local, never committed):
 *   1) put your Sandbox Access Token in services/backend/.dev.vars
 *      (SQUARE_ACCESS_TOKEN=EAAA...)
 *   2) npm run connect-square   (from services/backend)
 *
 * It will:
 *   - verify the token + find your sandbox Location ID (no hunting),
 *   - seed a starter menu into the sandbox catalog if it's empty,
 *   - write SQUARE_LOCATION_ID + SQUARE_APPLICATION_ID into .dev.vars
 *     so `npm run dev` immediately serves the REAL sandbox menu.
 *
 * Safe: sandbox only, no real money, nothing leaves your machine.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const DEV_VARS = resolve(HERE, "..", ".dev.vars");
const API_VERSION = "2026-01-22";
const HOST = "https://connect.squareupsandbox.com";
// Non-secret sandbox Application ID (safe to keep in code).
const DEFAULT_APP_ID = "sandbox-sq0idb-TDtiLZtopTCh-jcki61aMA";

function readDevVars() {
  if (!existsSync(DEV_VARS)) {
    fail(
      `No .dev.vars found.\n  Run: cp services/backend/.dev.vars.example services/backend/.dev.vars\n  then paste your Sandbox Access Token into SQUARE_ACCESS_TOKEN=`,
    );
  }
  const vars = {};
  for (const line of readFileSync(DEV_VARS, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m) vars[m[1]] = m[2];
  }
  return vars;
}

function writeDevVar(key, value) {
  let text = existsSync(DEV_VARS) ? readFileSync(DEV_VARS, "utf8") : "";
  const line = `${key}=${value}`;
  if (new RegExp(`^\\s*${key}\\s*=.*$`, "m").test(text)) {
    text = text.replace(new RegExp(`^\\s*${key}\\s*=.*$`, "m"), line);
  } else {
    text += (text.endsWith("\n") || text === "" ? "" : "\n") + line + "\n";
  }
  writeFileSync(DEV_VARS, text);
}

function fail(msg) {
  console.error(`\n❌ ${msg}\n`);
  process.exit(1);
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

const vars = readDevVars();
const TOKEN = vars.SQUARE_ACCESS_TOKEN;
if (!TOKEN || TOKEN.length < 10) {
  fail("SQUARE_ACCESS_TOKEN is empty in services/backend/.dev.vars. Paste your Sandbox Access Token there first.");
}

console.log("🔌 Connecting to your Square sandbox…");

// 1) Find the location id.
const { locations = [] } = await sq("/v2/locations");
if (locations.length === 0) fail("No locations on this sandbox account.");
const location = locations[0];
console.log(`📍 Location found: ${location.name ?? location.id} (${location.id})`);

// 2) Seed a starter menu if the catalog is empty.
const list = await sq("/v2/catalog/list?types=ITEM");
const itemCount = (list.objects ?? []).length;
if (itemCount > 0) {
  console.log(`🍽️  Catalog already has ${itemCount} item(s) — leaving it as-is.`);
} else {
  console.log("🌱 Catalog is empty — seeding a starter menu…");
  await sq("/v2/catalog/batch-upsert", {
    method: "POST",
    body: JSON.stringify(STARTER_MENU()),
  });
  console.log("✅ Seeded: Subs, Drinks, Sweet Treats.");
}

// 3) Persist the discovered config for local dev.
writeDevVar("SQUARE_LOCATION_ID", location.id);
writeDevVar("SQUARE_APPLICATION_ID", vars.SQUARE_APPLICATION_ID || DEFAULT_APP_ID);

console.log(`
🎉 Done! Your sandbox is connected.
   • Location ID saved to services/backend/.dev.vars
   • Start the app:  npm run backend:dev   (then  npm run mobile:start)
   • The app will now show your REAL sandbox menu and accept the Square test card.
`);

// --- starter menu (Square Catalog batch-upsert payload) ---
function STARTER_MENU() {
  const money = (amount) => ({ amount, currency: "USD" });
  const mod = (id, name, amount) => ({
    type: "MODIFIER",
    id: `#${id}`,
    modifier_data: { name, price_money: money(amount) },
  });
  const variation = (itemRef, id, name, amount) => ({
    type: "ITEM_VARIATION",
    id: `#${id}`,
    item_variation_data: {
      item_id: `#${itemRef}`,
      name,
      pricing_type: "FIXED_PRICING",
      price_money: money(amount),
    },
  });
  const item = (id, name, description, variations, modifierListIds = []) => ({
    type: "ITEM",
    id: `#${id}`,
    item_data: {
      name,
      description,
      variations,
      modifier_list_info: modifierListIds.map((mid) => ({ modifier_list_id: `#${mid}`, enabled: true })),
    },
  });

  return {
    idempotency_key: `seed-${Date.now()}`,
    batches: [
      {
        objects: [
          {
            type: "MODIFIER_LIST",
            id: "#bread",
            modifier_list_data: {
              name: "Choose your bread",
              selection_type: "SINGLE",
              modifiers: [mod("white", "White", 0), mod("wheat", "Wheat", 0), mod("herb", "Herb & Cheese", 50)],
            },
          },
          {
            type: "MODIFIER_LIST",
            id: "#extras",
            modifier_list_data: {
              name: "Add extras",
              selection_type: "MULTIPLE",
              modifiers: [mod("bacon", "Extra bacon", 150), mod("avocado", "Avocado", 125), mod("xcheese", "Extra cheese", 75)],
            },
          },
          item(
            "italian",
            "Italian Sub",
            "Ham, salami, pepperoni, provolone, lettuce, tomato, onion.",
            [variation("italian", "italian-6", "6 inch", 799), variation("italian", "italian-12", "Footlong", 1199)],
            ["bread", "extras"],
          ),
          item(
            "turkey",
            "Turkey Club",
            "Roasted turkey, bacon, lettuce, tomato, mayo.",
            [variation("turkey", "turkey-6", "6 inch", 849), variation("turkey", "turkey-12", "Footlong", 1249)],
            ["bread"],
          ),
          item("shake", "Milkshake", "Chocolate, vanilla, strawberry, Oreo, or peanut butter.", [
            variation("shake", "shake-1", "Regular", 499),
          ]),
          item("cookie", "Fresh Baked Cookie", "Made in-house daily — ask for today's flavor.", [
            variation("cookie", "cookie-1", "Each", 249),
          ]),
        ],
      },
    ],
  };
}
