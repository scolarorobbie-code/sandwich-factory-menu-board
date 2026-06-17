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
  /**
   * Optional, additive. When present (set by the merchant control panel's
   * override layer from a `ConditionalRule`), the group is hidden until a
   * trigger selection is made — the data-driven version of the app's combo→drink
   * regex heuristic. Absent for most groups; the app falls back to the regex
   * heuristic only when NO group on the item carries this field. See
   * `ConditionalRule` below.
   */
  conditional?: ConditionalRule;
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

/**
 * PATCH /me — update the signed-in customer's editable profile fields. Additive;
 * all fields optional, only the provided ones are changed. Email and identity are
 * NOT editable here. Phone matters: Apple Sign-In users have none, which blocks
 * Square Loyalty (mapped by phone) — this lets them add it.
 */
export interface UpdateProfileRequest {
  firstName?: string;
  lastName?: string;
  /** E.164, used to map the customer into Square Loyalty (Stars). */
  phone?: string;
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
  /** The build to save. Currently REQUIRED — the only supported path. */
  lineItems?: CartLineItem[];
  /**
   * NOT YET SUPPORTED. Saving a favorite directly from a past order is rejected
   * (422) because stored orders don't retain modifier ids; reconstructing the
   * cart needs an order-time cart snapshot (future work). Send `lineItems`.
   */
  fromOrderId?: string;
}

// ---------------------------------------------------------------------------
// Devices (Expo push token registration)
// ---------------------------------------------------------------------------

export interface RegisterDeviceRequest {
  /** ExponentPushToken[...] from expo-notifications. */
  expoPushToken: string;
  platform: "ios" | "android";
  /**
   * When true, register this device as the STAFF / store tablet so it receives
   * new-order alerts instead of customer status pushes. The owner sets the store
   * tablet via this flag (the device must be signed in, then toggled to staff in
   * the app) or, alternatively, via the backend STAFF_PUSH_TOKEN env var.
   * Omitted/false = a normal customer device. Additive; defaults to false.
   */
  staff?: boolean;
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
// Menu overrides (merchant control panel — the "Orda-style" admin layer)
//
// Square stays the SOURCE OF TRUTH for items, variations, prices, modifiers and
// photos. These overrides are stored on OUR side (the control panel) and layered
// on top of the live Square menu by the backend after fetchLiveMenu. They capture
// the rules Square's own API cannot express per-group (required/min/max,
// conditional reveal) plus operational toggles (hide / sold-out / prep time).
//
// IDs reference Square catalog object IDs:
//   - item override key   = the Square ITEM object id (MenuItem.id)
//   - group override key   = the Square MODIFIER_LIST id (ModifierGroup.id)
//   - modifier id (in conditional triggers) = the Square MODIFIER id (Modifier.id)
//
// Design note: the conditional-modifier concept currently lives in the app as a
// regex heuristic (isConditionalGroup/isComboTrigger via /drink/ + /combo/ in
// ItemDetailScreen). `ConditionalRule` is the DATA shape that can eventually
// drive the SAME behavior without regex. The app heuristic stays in place until
// the app reads these overrides; this layer is additive for now.
// ---------------------------------------------------------------------------

/**
 * Reveal a modifier group only when a "trigger" modifier in another group is
 * selected. Mirrors the app's combo→drink heuristic, but data-driven.
 */
export interface ConditionalRule {
  /** Group is hidden until the condition below is met. */
  hiddenUntilTriggered: true;
  /**
   * Group IDs (Square MODIFIER_LIST ids) whose selection can trigger this group.
   * When empty, `triggerModifierIds` alone decides.
   */
  triggerGroupIds?: string[];
  /**
   * Specific modifier IDs (Square MODIFIER ids) that, when selected, reveal this
   * group (e.g. the "Make it a combo" option). When empty, ANY selection in a
   * `triggerGroupIds` group reveals it.
   */
  triggerModifierIds?: string[];
}

/** Per-modifier-GROUP override. Square is still the source of the modifiers. */
export interface GroupOverride {
  /** Square MODIFIER_LIST id this override applies to. */
  groupId: string;
  /** Force the group required (true) / optional (false). Omit = use Square. */
  required?: boolean;
  /** Minimum selections. Omit = use Square's min. */
  minSelections?: number;
  /** Maximum selections. Omit = use Square's max. */
  maxSelections?: number;
  /** When present, the group only shows once the rule is triggered. */
  conditional?: ConditionalRule;
}

/** Per-ITEM override. Square is still the source of the item + price. */
export interface ItemOverride {
  /** Square ITEM id this override applies to. */
  itemId: string;
  /** Hide the item from the menu entirely (e.g. seasonal pull). */
  hidden?: boolean;
  /** Mark sold out for today without touching Square Inventory. */
  soldOut?: boolean;
  /** Prep time in minutes → feeds Square order `pickup_at` later. */
  prepTimeMinutes?: number;
  /** Per-group overrides for this item's modifier groups. */
  groups?: GroupOverride[];
}

/**
 * Discount a deal applies at checkout. Deals are an APP-SIDE promotional layer
 * (codes / fixed-amount knock-offs / Stars multipliers) — they are NOT a Square
 * catalog concept, and that is expected. Square still computes the authoritative
 * order total in LIVE mode; this spec drives the mock-mode discount and tells the
 * app what the deal does.
 *
 * Kinds:
 *   - `freeItem`   — knock a fixed `amountCents` off once the cart subtotal meets
 *                    `minSubtotalCents` (e.g. "free cookie over $15" = a $2.49 credit
 *                    above a $15 subtotal). Encodes the legacy `deal-free-cookie`.
 *   - `amountOff`  — knock a fixed `amountCents` off (optionally gated by
 *                    `minSubtotalCents`). A general fixed-amount promo.
 *   - `doubleStars`— no checkout discount; a flag that the deal multiplies Stars.
 *                    Encodes the legacy `deal-double-stars`.
 */
export interface DealDiscount {
  kind: "freeItem" | "amountOff" | "doubleStars";
  /** Fixed amount knocked off, in cents. Required for freeItem / amountOff. */
  amountCents?: number;
  /** Minimum cart subtotal (cents) before the discount applies. Omit = no floor. */
  minSubtotalCents?: number;
}

/**
 * A fully merchant-editable deal. Lives in the overrides store (control panel),
 * mapped to the app-facing `Deal` contract by the backend. The owner can create,
 * edit, toggle and remove deals from the dashboard with no code changes — Square
 * stays the source of truth for prices; this is just the promo layer on top.
 */
export interface DealOverride {
  /** Our deal id (stable; used as the map key and at checkout via `dealId`). */
  dealId: string;
  /** Headline shown in the app, e.g. "Free cookie over $15". */
  title: string;
  /** Body copy shown in the app. */
  description: string;
  /** Promo code the customer applies at checkout, if any. */
  code?: string;
  /** Optional image. */
  imageUrl?: string;
  /** Off → the deal is hidden from the app and never applies. Defaults true. */
  enabled?: boolean;
  /** Marketing flag: shown as "APP ONLY" in the app. Defaults true. */
  appExclusive?: boolean;
  /** ISO start of the active window. Omit = active immediately. */
  startsAt?: Timestamp;
  /** ISO end of the active window. Omit = no end. */
  endsAt?: Timestamp;
  /** What the deal does at checkout. Omit = informational only (no discount). */
  discount?: DealDiscount;
}

/**
 * The full overrides document the control panel reads/writes. Keyed maps keep
 * lookups O(1) when applying to the menu and make the in-memory → KV/D1 swap a
 * localized change (mirrors store.ts conventions).
 */
export interface MenuOverrides {
  /** Map of Square ITEM id → item override. */
  items: Record<string, ItemOverride>;
  /** Map of our deal id → deal override (the merchant-managed deals layer). */
  deals: Record<string, DealOverride>;
  /** Last-write timestamp for cache busting / optimistic concurrency. */
  updatedAt: Timestamp;
}

/** PUT /admin/overrides request — replaces the stored overrides document. */
export interface PutOverridesRequest {
  items: Record<string, ItemOverride>;
  deals?: Record<string, DealOverride>;
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
