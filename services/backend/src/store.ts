import type { Customer, Favorite, Order } from "@sf/contract";

/**
 * DEV-ONLY in-memory store. Resets when the Worker restarts.
 *
 * Phase 1 runs on this so the full order loop works without external infra.
 * Production replaces it with Workers KV / D1 (users, tokens, orders) and
 * Square (customers, orders, payments, loyalty). Keep all persistence behind
 * these functions so swapping the backing store is a localized change.
 */

export interface StoredUser {
  customer: Customer;
  /** PBKDF2 hash; absent for Apple-only accounts. */
  passwordHash?: string;
  passwordSalt?: string;
  /** Loyalty Stars balance — mock-mode source of truth. In LIVE mode Square
   * Loyalty is authoritative; this is only a display fallback. */
  stars: number;
  /** Cached Square Loyalty account id (resolved by phone on first earn/redeem). */
  loyaltyAccountId?: string;
  /** Registered Expo push tokens. */
  pushTokens: { token: string; platform: "ios" | "android" }[];
}

/** A registered Expo push device token + its platform. */
export interface DeviceToken {
  token: string;
  platform: "ios" | "android";
}

const usersById = new Map<string, StoredUser>();
const usersByEmail = new Map<string, string>(); // email -> userId
const ordersById = new Map<string, Order>();
const ordersByUser = new Map<string, string[]>(); // userId -> orderIds (newest last)
const ownerBySquareOrderId = new Map<string, string>(); // squareOrderId -> userId
const favoritesByUser = new Map<string, Favorite[]>();
const seenEvents = new Set<string>(); // webhook de-dupe fallback when no KV
const staffTokens = new Map<string, DeviceToken>(); // token -> device (the store tablet(s))

let orderSeq = 1042; // next display number starts at 1043 (matches CLAUDE.md example)

export function nextDisplayNumber(): string {
  orderSeq += 1;
  return String(orderSeq);
}

export const store = {
  // --- users ---
  getUser: (id: string) => usersById.get(id),
  getUserByEmail: (email: string) => {
    const id = usersByEmail.get(email.toLowerCase());
    return id ? usersById.get(id) : undefined;
  },
  putUser(user: StoredUser) {
    usersById.set(user.customer.id, user);
    usersByEmail.set(user.customer.email.toLowerCase(), user.customer.id);
  },

  // --- orders ---
  getOrder: (id: string) => ordersById.get(id),
  putOrder(userId: string, order: Order) {
    ordersById.set(order.id, order);
    const list = ordersByUser.get(userId) ?? [];
    if (!list.includes(order.id)) list.push(order.id);
    ordersByUser.set(userId, list);
    // Index by Square order id so an incoming Square webhook (which only knows
    // the Square order id) can find OUR order + its owner to push them.
    if (order.squareOrderId) ownerBySquareOrderId.set(order.squareOrderId, userId);
  },
  listOrders(userId: string): Order[] {
    const ids = ordersByUser.get(userId) ?? [];
    return ids
      .map((id) => ordersById.get(id))
      .filter((o): o is Order => Boolean(o))
      .reverse(); // newest first
  },
  /** Resolve a Square order id -> { our order, owning user }. Used by webhooks. */
  getBySquareOrderId(squareOrderId: string): { order: Order; user: StoredUser } | undefined {
    const userId = ownerBySquareOrderId.get(squareOrderId);
    if (!userId) return undefined;
    const user = usersById.get(userId);
    if (!user) return undefined;
    for (const id of ordersByUser.get(userId) ?? []) {
      const order = ordersById.get(id);
      if (order?.squareOrderId === squareOrderId) return { order, user };
    }
    return undefined;
  },

  // --- staff / store-tablet devices ---
  // Separate from customer pushTokens: these get NEW-ORDER alerts, not status
  // pushes. The owner registers the tablet via POST /devices { staff: true }.
  addStaffToken(device: DeviceToken) {
    staffTokens.set(device.token, device);
  },
  listStaffTokens: (): DeviceToken[] => [...staffTokens.values()],
  /** Replace the staff token set (used to drop tokens Expo reports as dead). */
  replaceStaffTokens(devices: DeviceToken[]) {
    staffTokens.clear();
    for (const d of devices) staffTokens.set(d.token, d);
  },

  // --- favorites ---
  listFavorites: (userId: string) => favoritesByUser.get(userId) ?? [],
  addFavorite(userId: string, fav: Favorite) {
    const list = favoritesByUser.get(userId) ?? [];
    list.push(fav);
    favoritesByUser.set(userId, list);
  },
  removeFavorite(userId: string, favId: string): boolean {
    const list = favoritesByUser.get(userId) ?? [];
    const next = list.filter((f) => f.id !== favId);
    favoritesByUser.set(userId, next);
    return next.length !== list.length;
  },

  // --- webhook de-dupe fallback (KV preferred when present) ---
  seenEvent: (id: string) => seenEvents.has(id),
  markEvent: (id: string) => void seenEvents.add(id),

  /**
   * Test/dev reset of all in-memory state. Production never calls this (the
   * backing store is KV/D1); it exists so unit tests start from a clean slate.
   */
  reset() {
    usersById.clear();
    usersByEmail.clear();
    ordersById.clear();
    ordersByUser.clear();
    favoritesByUser.clear();
    seenEvents.clear();
    orderSeq = 1042;
  },
};
