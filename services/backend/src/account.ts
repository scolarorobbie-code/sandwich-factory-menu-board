import type {
  CreateFavoriteRequest,
  Favorite,
  Loyalty,
  RegisterDeviceRequest,
} from "@sf/contract";
import type { Env } from "./env";
import { error, json, noContent } from "./responses";
import { store, type StoredUser } from "./store";

/** Stars balance + reward tiers (Square Loyalty in production; branding: "Stars"). */
export function getLoyalty(user: StoredUser): Response {
  const loyalty: Loyalty = {
    stars: user.stars,
    earnRule: "1 Star per $1 spent",
    rewards: [
      { id: "reward-5", name: "$5 off", cost: 50, value: { amount: 500, currency: "USD" } },
      { id: "reward-10", name: "$10 off", cost: 100, value: { amount: 1000, currency: "USD" } },
    ],
  };
  return json(loyalty);
}

export function listFavorites(user: StoredUser): Response {
  return json(store.listFavorites(user.customer.id));
}

export async function addFavorite(req: Request, _env: Env, user: StoredUser): Promise<Response> {
  const body = (await req.json()) as CreateFavoriteRequest;
  if (!body.name) return error("VALIDATION_FAILED", "name is required", 422);

  let lineItems = body.lineItems;
  if (!lineItems && body.fromOrderId) {
    const order = store.getOrder(body.fromOrderId);
    if (!order) return error("NOT_FOUND", "Source order not found", 404);
    // Rebuild a cart from the past order's line items (names -> ids isn't stored
    // on Order; in production we snapshot the original cart. Mock keeps it empty
    // and lets the app re-add). For now require explicit lineItems.
    return error("VALIDATION_FAILED", "Provide lineItems to save this favorite", 422);
  }
  if (!lineItems?.length) return error("VALIDATION_FAILED", "lineItems required", 422);

  const fav: Favorite = {
    id: crypto.randomUUID(),
    name: body.name,
    lineItems,
    createdAt: new Date().toISOString(),
  };
  store.addFavorite(user.customer.id, fav);
  return json(fav, 201);
}

export function removeFavorite(favId: string, user: StoredUser): Response {
  return store.removeFavorite(user.customer.id, favId)
    ? noContent()
    : error("NOT_FOUND", "Favorite not found", 404);
}

export async function registerDevice(req: Request, _env: Env, user: StoredUser): Promise<Response> {
  const body = (await req.json()) as RegisterDeviceRequest;
  if (!body.expoPushToken || !body.platform) {
    return error("VALIDATION_FAILED", "expoPushToken and platform required", 422);
  }
  const existing = user.pushTokens.find((t) => t.token === body.expoPushToken);
  if (!existing) {
    user.pushTokens.push({ token: body.expoPushToken, platform: body.platform });
    store.putUser(user);
  }
  return noContent();
}
