/**
 * Sandwich Factory Ordering App — shared API contract types.
 *
 * SOURCE OF TRUTH. Imported directly by both the Expo app and the Cloudflare
 * Worker backend so the two sides cannot drift. Keep in sync with openapi.yaml.
 *
 * Money is ALWAYS integer minor units (cents) + currency. Never floats.
 */

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export type CurrencyCode = "USD";

export interface Money {
  /** Integer minor units (cents). */
  amount: number;
  currency: CurrencyCode;
}

/** RFC 3339 / ISO 8601 UTC timestamp. */
export type Timestamp = string;

export interface ApiError {
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
  };
}

export type ErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_FAILED"
  | "CONFLICT"
  | "ITEM_UNAVAILABLE"
  | "PAYMENT_DECLINED"
  | "RATE_LIMITED"
  | "SQUARE_ERROR"
  | "INTERNAL";

export interface Paginated<T> {
  items: T[];
  /** Opaque cursor; absent when there are no more pages. */
  cursor?: string;
}

// ---------------------------------------------------------------------------
// Menu (proxied from Square Catalog — never hardcoded)
// ---------------------------------------------------------------------------

export interface Menu {
  categories: MenuCategory[];
  /** Catalog version/hash for cache invalidation. */
  version: string;
  fetchedAt: Timestamp;
}

export interface MenuCategory {
  id: string;
  name: string;
  /** Display order, ascending. */
  ordinal: number;
  items: MenuItem[];
}

export interface MenuItem {
  id: string;
  name: string;
  description?: string;
  imageUrl?: string;
  /** Selectable size/price options. At least one. */
  variations: MenuVariation[];
  /** Groups of add-ons / choices (bread, toppings, etc.). */
  modifierGroups: ModifierGroup[];
  /** False when sold out today (Square inventory). */
  available: boolean;
}

export interface MenuVariation {
  id: string;
  name: string; // e.g. "6 inch", "Footlong"
  price: Money;
  available: boolean;
}

export interface ModifierGroup {
  id: string;
  name: string; // e.g. "Choose your bread"
  minSelections: number; // 0 = optional
  maxSelections: number; // 1 = single-select; >1 = multi-select
  modifiers: Modifier[];
}

export interface Modifier {
  id: string;
  name: string; // e.g. "Extra bacon"
  /** Added to the line price. May be zero. */
  price: Money;
  available: boolean;
  /** Pre-selected by default (e.g. default bread). */
  selectedByDefault?: boolean;
}

// ---------------------------------------------------------------------------
// Cart / Order line items (what the app sends to create an order)
// ---------------------------------------------------------------------------

export interface CartLineItem {
  itemId: string;
  variationId: string;
  quantity: number; // >= 1
  /** Chosen modifier IDs across all groups for this line. */
  modifierIds: string[];
  /** Free-text note for the kitchen (e.g. "no onions"). Optional. */
  note?: string;
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

export type OrderStatus =
  | "DRAFT" // created in Square, not yet paid
  | "RECEIVED" // paid; staff notified
  | "MAKING" // staff marked in-progress
  | "READY" // ready for pickup; customer notified
  | "COMPLETED" // picked up
  | "CANCELED";

export interface OrderLineItem {
  name: string;
  variationName: string;
  quantity: number;
  modifiers: { name: string; price: Money }[];
  note?: string;
  /** Line total incl. modifiers × quantity. */
  total: Money;
}

export interface Order {
  id: string; // our order id
  squareOrderId: string;
  /** Short human-facing ticket number, e.g. "1043". */
  displayNumber: string;
  status: OrderStatus;
  lineItems: OrderLineItem[];
  subtotal: Money;
  tax: Money;
  /** Loyalty / deal discounts applied. */
  discount: Money;
  total: Money;
  /** Stars earned on this order (populated after payment). */
  starsEarned?: number;
  pickup: {
    /** Estimated ready time. */
    readyEta?: Timestamp;
    note?: string;
  };
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** POST /orders request. Pickup only — no delivery fields. */
export interface CreateOrderRequest {
  lineItems: CartLineItem[];
  /** Optional app-exclusive deal / promo code to apply. */
  dealId?: string;
  /** Stars to redeem at checkout, if any. */
  redeemStars?: number;
  pickupNote?: string;
}

/** POST /orders response — order is created but not yet paid. */
export interface CreateOrderResponse {
  order: Order;
  /** Amount the client must authorize via the In-App Payments SDK. */
  amountDue: Money;
}

// ---------------------------------------------------------------------------
// Payments (card tokenized on-device; backend never sees raw card data)
// ---------------------------------------------------------------------------

/** POST /payments request. */
export interface CreatePaymentRequest {
  orderId: string;
  /** Opaque payment token (nonce) from the Square In-App Payments SDK. */
  sourceId: string;
  /** Optional SCA verification token from the SDK. */
  verificationToken?: string;
}

export interface CreatePaymentResponse {
  order: Order; // now status RECEIVED
  paymentId: string;
  receiptUrl?: string;
}

// ---------------------------------------------------------------------------
// Auth (backend issues JWTs; Square Customers API holds the profile)
// ---------------------------------------------------------------------------

export interface AuthTokens {
  accessToken: string; // short-lived JWT
  refreshToken: string;
  expiresIn: number; // seconds until accessToken expires
}

export interface RegisterRequest {
  email: string;
  password: string;
  firstName: string;
  lastName?: string;
  /** E.164, for order-status SMS fallback. Optional. */
  phone?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

/** POST /auth/apple — Sign in with Apple. */
export interface AppleAuthRequest {
  /** Apple identity token (JWT) returned by the native Apple flow. */
  identityToken: string;
  /** Apple authorization code. */
  authorizationCode: string;
  /** Apple only sends name on first auth; pass it through when present. */
  firstName?: string;
  lastName?: string;
}

export interface RefreshRequest {
  refreshToken: string;
}

export type AuthResponse = AuthTokens & { customer: Customer };

export interface Customer {
  id: string;
  squareCustomerId: string;
  email: string;
  firstName: string;
  lastName?: string;
  phone?: string;
  createdAt: Timestamp;
}

// ---------------------------------------------------------------------------
// Loyalty (Square Loyalty API; branding = "Stars")
// ---------------------------------------------------------------------------

export interface Loyalty {
  /** Current redeemable balance. */
  stars: number;
  /** Human-readable accrual rule, e.g. "1 Star per $1". */
  earnRule: string;
  /** Available reward tiers. */
  rewards: LoyaltyReward[];
}

export interface LoyaltyReward {
  id: string;
  name: string; // e.g. "$5 off"
  /** Stars required to redeem. */
  cost: number;
  /** Discount granted. */
  value: Money;
}

// ---------------------------------------------------------------------------
// Deals (app-exclusive promos)
// ---------------------------------------------------------------------------

export interface Deal {
  id: string;
  title: string; // "Double Stars this week"
  description: string;
  imageUrl?: string;
  /** Promo code, if the deal applies at checkout. */
  code?: string;
  startsAt: Timestamp;
  endsAt: Timestamp;
  appExclusive: boolean;
}

// ---------------------------------------------------------------------------
// Favorites (saved orders / one-tap reorder)
// ---------------------------------------------------------------------------

export interface Favorite {
  id: string;
  name: string; // user label, e.g. "My usual"
  lineItems: CartLineItem[];
  createdAt: Timestamp;
}

export interface CreateFavoriteRequest {
  name: string;
  /** Either build from scratch or snapshot from a past order. */
  lineItems?: CartLineItem[];
  fromOrderId?: string;
}

// ---------------------------------------------------------------------------
// Devices (Expo push token registration)
// ---------------------------------------------------------------------------

export interface RegisterDeviceRequest {
  /** ExponentPushToken[...] from expo-notifications. */
  expoPushToken: string;
  platform: "ios" | "android";
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

export interface Health {
  status: "ok";
  squareEnvironment: "sandbox" | "production";
  apiVersion: string; // Square API version, e.g. "2026-01-22"
  time: Timestamp;
}

// ---------------------------------------------------------------------------
// Square webhook payload (backend-internal; verified by HMAC, de-duped by id)
// ---------------------------------------------------------------------------

export interface SquareWebhookEvent {
  /** De-dupe key. One event_id is processed at most once. */
  event_id: string;
  type: string; // e.g. "order.created", "order.updated"
  merchant_id: string;
  created_at: Timestamp;
  data: {
    type: string;
    id: string;
    object: unknown;
  };
}
