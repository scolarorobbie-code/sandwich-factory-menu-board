import type {
  CartLineItem,
  CreateOrderRequest,
  CreateOrderResponse,
  Menu,
  MenuItem,
  Money,
  Order,
  OrderLineItem,
} from "@sf/contract";
import type { Env } from "./env";
import { isLive } from "./env";
import {
  bestAffordableReward,
  findOrCreateLoyaltyAccount,
  getAccountBalance,
  getLoyaltyProgram,
  redeemReward,
} from "./loyalty";
import { dealDiscountCents, getApplicableDealOverride, getMenu } from "./menu";
import { maxPrepTimeMinutes, overridesStore } from "./overrides";
import { error, json } from "./responses";
import { createSquareOrder, retrieveSquareOrder, type SquareLineItem } from "./square";
import { nextDisplayNumber, store, type StoredUser } from "./store";

// Murfreesboro, TN combined sales tax. Mock-mode only — in production Square's
// Orders API calculates tax/discounts authoritatively from the catalog + location.
const TAX_RATE = 0.0975;
const STARS_PER_DOLLAR = 1;

// Floor prep time when no per-item override is set, so `pickup_at` is always a
// realistic few minutes out rather than "now". The control panel can raise this
// per item via `prepTimeMinutes`.
const DEFAULT_PREP_MINUTES = 10;

const usd = (amount: number): Money => ({ amount: Math.round(amount), currency: "USD" });

function findItem(menu: Menu, itemId: string): MenuItem | undefined {
  for (const c of menu.categories) {
    const found = c.items.find((i) => i.id === itemId);
    if (found) return found;
  }
  return undefined;
}

/** Price a single cart line against the menu. Throws a message on bad input. */
export function priceLine(menu: Menu, line: CartLineItem): OrderLineItem {
  const item = findItem(menu, line.itemId);
  if (!item) throw new Error(`Unknown item: ${line.itemId}`);
  if (!item.available) throw new Error(`${item.name} is unavailable`);

  const variation = item.variations.find((v) => v.id === line.variationId);
  if (!variation) throw new Error(`Unknown variation for ${item.name}`);
  if (!variation.available) throw new Error(`${item.name} (${variation.name}) is unavailable`);

  const chosen = [];
  for (const modId of line.modifierIds) {
    let mod;
    for (const g of item.modifierGroups) {
      const m = g.modifiers.find((x) => x.id === modId);
      if (m) mod = m;
    }
    if (!mod) throw new Error(`Unknown modifier ${modId} for ${item.name}`);
    if (!mod.available) throw new Error(`${mod.name} is unavailable`);
    chosen.push({ name: mod.name, price: mod.price });
  }

  const qty = Math.max(1, Math.floor(line.quantity));
  const unit = variation.price.amount + chosen.reduce((s, m) => s + m.price.amount, 0);
  return {
    name: item.name,
    variationName: variation.name,
    quantity: qty,
    modifiers: chosen,
    note: line.note,
    total: usd(unit * qty),
  };
}

export async function createOrder(req: Request, env: Env, user: StoredUser): Promise<Response> {
  const body = (await req.json()) as CreateOrderRequest;
  if (!body.lineItems?.length) {
    return error("VALIDATION_FAILED", "Order must have at least one item", 422);
  }

  const menu = await getMenu(env);
  let lineItems: OrderLineItem[];
  try {
    lineItems = body.lineItems.map((l) => priceLine(menu, l));
  } catch (e) {
    return error("ITEM_UNAVAILABLE", e instanceof Error ? e.message : "Invalid line item", 422);
  }

  const subtotal = lineItems.reduce((s, l) => s + l.total.amount, 0);

  // App-exclusive deal discount (control-panel managed via the DealDiscount
  // spec, not a hardcoded id check; doubleStars/expired/disabled → 0). Resolved
  // for BOTH modes: mock applies it to local totals; live passes it to Square as
  // an ad-hoc ORDER discount so the REAL charge is reduced too.
  let dealCents = 0;
  let dealName: string | undefined;
  if (body.dealId) {
    const deal = await getApplicableDealOverride(env, body.dealId);
    if (deal) {
      dealCents = Math.min(dealDiscountCents(deal, subtotal), subtotal);
      dealName = deal.title;
    }
  }

  // Stars redemption in MOCK mode only (50 Stars = $5). In LIVE mode Stars are
  // redeemed as a real Square Loyalty reward below (Square computes the total).
  let discount = dealCents;
  if (!isLive(env) && body.redeemStars && body.redeemStars > 0) {
    const redeemable = Math.min(body.redeemStars, user.stars);
    const blocks = Math.floor(redeemable / 50);
    discount += blocks * 500;
  }
  discount = Math.min(discount, subtotal);

  // Prep time → scheduled pickup. Drives Square `pickup_at` (live) AND the
  // customer-facing "ready by" ETA shown on the order-status screen (both modes).
  const prepMinutes = Math.max(
    DEFAULT_PREP_MINUTES,
    maxPrepTimeMinutes(await overridesStore.get(env), body.lineItems.map((l) => l.itemId)),
  );
  const readyEta = new Date(Date.now() + prepMinutes * 60_000).toISOString();

  // Totals + Square order id. Live mode lets Square compute tax authoritatively
  // and creates the real PICKUP order in the POS; mock computes locally.
  let squareOrderId = "";
  let subtotalM = usd(subtotal);
  let taxM = usd(Math.round((subtotal - discount) * TAX_RATE));
  let discountM = usd(discount);
  let totalM = usd(subtotal - discount + taxM.amount);

  if (isLive(env)) {
    try {
      const sqLines: SquareLineItem[] = body.lineItems.map((l) => ({
        catalogObjectId: l.variationId,
        quantity: Math.max(1, Math.floor(l.quantity)),
        modifierIds: l.modifierIds,
        note: l.note,
      }));
      const idempotencyKey = req.headers.get("Idempotency-Key") ?? crypto.randomUUID();
      const name = [user.customer.firstName, user.customer.lastName].filter(Boolean).join(" ");
      // Pass the app deal to Square as an ad-hoc ORDER discount so the real
      // charge reflects it (Square then recomputes authoritative tax/total).
      const sqDiscount = dealCents > 0 ? { name: dealName ?? "App deal", amountCents: dealCents } : undefined;
      let sq = await createSquareOrder(env, sqLines, idempotencyKey, name, body.pickupNote, readyEta, sqDiscount);
      squareOrderId = sq.squareOrderId;

      // Stars redemption: in LIVE mode this is a real Square Loyalty reward, so
      // the discount/total come straight from Square (never our own 50=$5 math).
      // Best-effort — if the merchant has no loyalty program, the customer has no
      // account, or no tier is affordable, we skip redeeming and keep the order.
      if (body.redeemStars && body.redeemStars > 0) {
        const applied = await applyLoyaltyRedemption(
          env,
          user,
          squareOrderId,
          idempotencyKey,
          body.redeemStars,
        );
        if (applied) sq = await retrieveSquareOrder(env, squareOrderId);
      }

      subtotalM = sq.subtotal;
      taxM = sq.tax;
      discountM = sq.discount;
      totalM = sq.total;
    } catch (e) {
      return error("SQUARE_ERROR", e instanceof Error ? e.message : "Could not create Square order", 502);
    }
  }

  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const order: Order = {
    id,
    squareOrderId: squareOrderId || `mock-order-${id.slice(0, 8)}`,
    displayNumber: nextDisplayNumber(),
    status: "DRAFT",
    lineItems,
    cartLineItems: body.lineItems,
    subtotal: subtotalM,
    tax: taxM,
    discount: discountM,
    total: totalM,
    starsEarned: Math.floor(subtotalM.amount / 100) * STARS_PER_DOLLAR,
    pickup: { note: body.pickupNote, readyEta },
    createdAt: now,
    updatedAt: now,
  };
  store.putOrder(user.customer.id, order);

  const res: CreateOrderResponse = { order, amountDue: order.total };
  return json(res, 201);
}

export function getOrder(orderId: string, user: StoredUser): Response {
  const order = store.getOrder(orderId);
  if (!order || !store.listOrders(user.customer.id).some((o) => o.id === orderId)) {
    return error("NOT_FOUND", "Order not found", 404);
  }
  return json(order);
}

export function listOrders(user: StoredUser): Response {
  return json({ items: store.listOrders(user.customer.id) });
}

/**
 * LIVE-mode Stars redemption via the real Square Loyalty API. Resolves the
 * customer's loyalty account (by phone), picks the most valuable reward tier
 * the customer can afford with both their balance and the `redeemStars` they
 * chose, and attaches that reward to the Square order — Square then recomputes
 * the order's discount/total authoritatively.
 *
 * Returns true when a reward was applied. Fully best-effort: no program, no
 * account, or no affordable tier → returns false and the order proceeds with no
 * redemption (never throws, never blocks the order).
 */
async function applyLoyaltyRedemption(
  env: Env,
  user: StoredUser,
  squareOrderId: string,
  idempotencyKey: string,
  redeemCap: number,
): Promise<boolean> {
  try {
    const program = await getLoyaltyProgram(env);
    if (!program || program.rewards.length === 0) return false;

    const accountId =
      user.loyaltyAccountId ??
      (await findOrCreateLoyaltyAccount(env, program.programId, user.customer.phone)) ??
      undefined;
    if (!accountId) return false;
    if (user.loyaltyAccountId !== accountId) {
      user.loyaltyAccountId = accountId;
      store.putUser(user);
    }

    const balance = (await getAccountBalance(env, accountId)) ?? 0;
    if (balance <= 0) return false;

    // Affordable tiers: cost <= live balance AND <= what the customer chose to
    // spend (`redeemCap`). Pick the highest-cost tier that fits.
    const tier = bestAffordableReward(program.rewards, balance, redeemCap);
    if (!tier) return false;

    const result = await redeemReward(env, accountId, tier.id, squareOrderId, `redeem-${idempotencyKey}`);
    return result !== null;
  } catch {
    return false;
  }
}
