import type { Deal, DealOverride, Menu, MenuOverrides } from "@sf/contract";
import { isLive, type Env } from "./env";
import { MOCK_MENU } from "./mocks/menu";
import { applyOverrides, overridesStore } from "./overrides";
import { fetchLiveMenu } from "./square";

/**
 * The menu, from live Square Catalog when credentials are present, else mock.
 *
 * Square stays the source of truth; the merchant control-panel overrides
 * (required/min/max, conditional groups, hide/sold-out) are layered on AFTER
 * the live fetch so they never become a competing source of items/prices.
 */
export async function getMenu(env: Env): Promise<Menu> {
  const base = isLive(env) ? await fetchLiveMenu(env) : MOCK_MENU;
  return applyOverrides(base, await overridesStore.get(env));
}

// ---------------------------------------------------------------------------
// Deals — an APP-SIDE promotional layer, managed from the control panel.
//
// Deals are NOT a Square catalog concept (codes / fixed-amount knock-offs /
// Stars multipliers). Square stays the price source of truth; this is the promo
// layer on top, stored in the same KV-backed overrides document the panel edits.
// The owner creates/edits/toggles deals from the dashboard — no code changes.
// ---------------------------------------------------------------------------

/**
 * The two deals the app shipped with, as DealOverrides. These SEED the store
 * the first time it is read with no deals, so nothing disappears for an owner
 * who has not opened the panel yet. Once the owner saves any deals, the store
 * wins and these are no longer injected.
 */
export function defaultDealOverrides(): Record<string, DealOverride> {
  return {
    "deal-double-stars": {
      dealId: "deal-double-stars",
      title: "Double Stars this week",
      description: "Earn 2 Stars per $1 on every app order through Sunday.",
      code: "DOUBLESTARS",
      enabled: true,
      appExclusive: true,
      discount: { kind: "doubleStars" },
    },
    "deal-free-cookie": {
      dealId: "deal-free-cookie",
      title: "Free cookie over $15",
      description: "Spend $15 in the app and we'll add a fresh-baked cookie on us.",
      code: "FREECOOKIE",
      enabled: true,
      appExclusive: true,
      discount: { kind: "freeItem", amountCents: 249, minSubtotalCents: 1500 },
    },
  };
}

/**
 * Resolve the merchant's deal overrides, seeding the shipped defaults when the
 * store holds none (so a fresh install still shows the two launch deals).
 */
export function resolveDealOverrides(overrides: MenuOverrides): Record<string, DealOverride> {
  const stored = overrides.deals ?? {};
  return Object.keys(stored).length > 0 ? stored : defaultDealOverrides();
}

/** True when `now` falls inside the deal's (optional) active window. */
function isWithinWindow(d: DealOverride, now: number): boolean {
  if (d.startsAt && Date.parse(d.startsAt) > now) return false;
  if (d.endsAt && Date.parse(d.endsAt) < now) return false;
  return true;
}

/** Map a stored DealOverride onto the app-facing Deal contract shape. */
function toDeal(d: DealOverride, now: number): Deal {
  const week = 7 * 24 * 60 * 60 * 1000;
  return {
    id: d.dealId,
    title: d.title,
    description: d.description,
    imageUrl: d.imageUrl,
    code: d.code,
    // The Deal contract requires a window; default to a rolling one when the
    // owner leaves the dates blank so the app's date fields stay populated.
    startsAt: d.startsAt ?? new Date(now - week).toISOString(),
    endsAt: d.endsAt ?? new Date(now + week).toISOString(),
    appExclusive: d.appExclusive ?? true,
  };
}

/**
 * App-exclusive deals, served to the app. Reads the merchant-managed deals from
 * the overrides store (seeded with the shipped defaults when empty), drops any
 * that are disabled or outside their active window, and maps each to the app
 * `Deal` contract. `code` deals apply their discount at checkout (see orders.ts).
 */
export async function getDeals(env: Env): Promise<Deal[]> {
  const now = Date.now();
  const overrides = resolveDealOverrides(await overridesStore.get(env));
  return Object.values(overrides)
    .filter((d) => d.enabled !== false && isWithinWindow(d, now))
    .map((d) => toDeal(d, now));
}

/**
 * Look up a single APPLICABLE deal override by id for checkout. Returns the
 * override only when it exists, is enabled, and is within its active window —
 * otherwise undefined, so an expired/disabled deal id never discounts an order.
 */
export async function getApplicableDealOverride(
  env: Env,
  dealId: string,
): Promise<DealOverride | undefined> {
  const now = Date.now();
  const overrides = resolveDealOverrides(await overridesStore.get(env));
  const d = overrides[dealId];
  if (!d || d.enabled === false || !isWithinWindow(d, now)) return undefined;
  return d;
}

/**
 * Compute the checkout discount (cents) a deal applies to a given subtotal.
 * Pure: derived entirely from the override's `discount` spec rather than a
 * hardcoded `deal.id === ...` check. `doubleStars` (and any non-discount deal)
 * yields 0 — it affects Stars accrual, not the total. In LIVE mode Square still
 * computes the authoritative total; this drives the mock-mode discount.
 */
export function dealDiscountCents(deal: DealOverride, subtotalCents: number): number {
  const spec = deal.discount;
  if (!spec) return 0;
  if (spec.kind === "doubleStars") return 0;
  if (typeof spec.minSubtotalCents === "number" && subtotalCents < spec.minSubtotalCents) {
    return 0;
  }
  const off = spec.amountCents ?? 0;
  return Math.max(0, Math.min(off, subtotalCents));
}
