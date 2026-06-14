import type {
  AuthResponse,
  AuthTokens,
  CreateOrderRequest,
  CreateOrderResponse,
  CreatePaymentResponse,
  Customer,
  Deal,
  Favorite,
  Health,
  Loyalty,
  Menu,
  Order,
  Paginated,
} from "@sf/contract";
import { API_BASE_URL } from "../config";

/** Supplies the current access token to authenticated requests. */
let tokenProvider: () => string | null = () => null;
export function setTokenProvider(fn: () => string | null) {
  tokenProvider = fn;
}

interface Options {
  body?: unknown;
  auth?: boolean;
  idempotencyKey?: string;
}

async function request<T>(method: string, path: string, opts: Options = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.auth) {
    const token = tokenProvider();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }
  if (opts.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const message = data?.error?.message ?? `${method} ${path} failed (${res.status})`;
    throw new ApiError(message, res.status, data?.error?.code);
  }
  return data as T;
}

export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string) {
    super(message);
  }
}

const uuid = () =>
  // RFC4122-ish; fine for an idempotency key.
  "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });

export const api = {
  health: () => request<Health>("GET", "/health"),
  menu: () => request<Menu>("GET", "/menu"),
  deals: () => request<Deal[]>("GET", "/deals"),

  register: (body: { email: string; password: string; firstName: string; lastName?: string; phone?: string }) =>
    request<AuthResponse>("POST", "/auth/register", { body }),
  login: (body: { email: string; password: string }) =>
    request<AuthResponse>("POST", "/auth/login", { body }),
  refresh: (refreshToken: string) =>
    request<AuthTokens>("POST", "/auth/refresh", { body: { refreshToken } }),
  me: () => request<Customer>("GET", "/me", { auth: true }),

  createOrder: (body: CreateOrderRequest) =>
    request<CreateOrderResponse>("POST", "/orders", { body, auth: true, idempotencyKey: uuid() }),
  getOrder: (id: string) => request<Order>("GET", `/orders/${id}`, { auth: true }),
  orderHistory: () => request<Paginated<Order>>("GET", "/orders", { auth: true }),
  advanceOrder: (id: string) => request<Order>("POST", `/orders/${id}/advance`, { auth: true }),

  pay: (orderId: string, sourceId: string, verificationToken?: string) =>
    request<CreatePaymentResponse>("POST", "/payments", {
      body: { orderId, sourceId, verificationToken },
      auth: true,
      idempotencyKey: uuid(),
    }),

  loyalty: () => request<Loyalty>("GET", "/loyalty", { auth: true }),
  favorites: () => request<Favorite[]>("GET", "/favorites", { auth: true }),
  registerDevice: (expoPushToken: string, platform: "ios" | "android") =>
    request<void>("POST", "/devices", { body: { expoPushToken, platform }, auth: true }),
};
