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
  /** Loyalty Stars balance (Square Loyalty in production). */
  stars: number;
  /** Registered Expo push tokens. */
  pushTokens: { token: string; platform: "ios" | "android" }[];
}

const usersById = new Map<string, StoredUser>();
const usersByEmail = new Map<string, string>(); // email -> userId
const ordersById = new Map<string, Order>();
const ordersByUser = new Map<string, string[]>(); // userId -> orderIds (newest last)
const favoritesByUser = new Map<string, Favorite[]>();
const seenEvents = new Set<string>(); // webhook de-dupe fallback when no KV

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
  },
  listOrders(userId: string): Order[] {
    const ids = ordersByUser.get(userId) ?? [];
    return ids
      .map((id) => ordersById.get(id))
      .filter((o): o is Order => Boolean(o))
      .reverse(); // newest first
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
};
