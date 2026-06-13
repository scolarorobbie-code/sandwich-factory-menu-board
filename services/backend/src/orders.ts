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
import { getDeals, getMenu } from "./menu";
import { error, json } from "./responses";
import { nextDisplayNumber, store, type StoredUser } from "./store";

// Murfreesboro, TN combined sales tax. Mock-mode only — in production Square's
// Orders API calculates tax/discounts authoritatively from the catalog + location.
const TAX_RATE = 0.0975;
const STARS_PER_DOLLAR = 1;

const usd = (amount: number): Money => ({ amount: Math.round(amount), currency: "USD" });

function findItem(menu: Menu, itemId: string): MenuItem | undefined {
  for (const c of menu.categories) {
    const found = c.items.find((i) => i.id === itemId);
    if (found) return found;
  }
  return undefined;
}

/** Price a single cart line against the menu. Throws a message on bad input. */
function priceLine(menu: Menu, line: CartLineItem): OrderLineItem {
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

  // Discounts: app-exclusive deal codes + Stars redemption (50 Stars = $5).
  let discount = 0;
  if (body.dealId) {
    const deal = getDeals().find((d) => d.id === body.dealId);
    if (deal?.id === "deal-free-cookie" && subtotal >= 1500) discount += 249;
  }
  if (body.redeemStars && body.redeemStars > 0) {
    const redeemable = Math.min(body.redeemStars, user.stars);
    const blocks = Math.floor(redeemable / 50);
    discount += blocks * 500;
  }
  discount = Math.min(discount, subtotal);

  const taxable = subtotal - discount;
  const tax = Math.round(taxable * TAX_RATE);
  const total = taxable + tax;

  // Production: POST /v2/orders to Square here (with Idempotency-Key) and use
  // the returned order id + Square-computed totals. Mock builds it locally.
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const order: Order = {
    id,
    squareOrderId: `mock-order-${id.slice(0, 8)}`,
    displayNumber: nextDisplayNumber(),
    status: "DRAFT",
    lineItems,
    subtotal: usd(subtotal),
    tax: usd(tax),
    discount: usd(discount),
    total: usd(total),
    starsEarned: Math.floor(subtotal / 100) * STARS_PER_DOLLAR,
    pickup: { note: body.pickupNote },
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
