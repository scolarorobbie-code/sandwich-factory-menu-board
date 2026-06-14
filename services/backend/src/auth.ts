import type {
  AppleAuthRequest,
  AuthResponse,
  AuthTokens,
  Customer,
  LoginRequest,
  RefreshRequest,
  RegisterRequest,
} from "@sf/contract";
import type { Env } from "./env";
import { error, json } from "./responses";
import { store, type StoredUser } from "./store";

const ACCESS_TTL = 60 * 60; // 1 hour
const REFRESH_TTL = 60 * 60 * 24 * 30; // 30 days

// --- base64url helpers ---
function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const b of arr) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlJson(obj: unknown): string {
  return b64url(new TextEncoder().encode(JSON.stringify(obj)));
}
function fromB64url(s: string): Uint8Array {
  const pad = s.length % 4 ? "=".repeat(4 - (s.length % 4)) : "";
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}

// --- JWT (HS256) ---
async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

interface JwtClaims {
  sub: string; // userId
  typ: "access" | "refresh";
  exp: number;
}

async function signJwt(secret: string, claims: JwtClaims): Promise<string> {
  const header = b64urlJson({ alg: "HS256", typ: "JWT" });
  const payload = b64urlJson(claims);
  const data = `${header}.${payload}`;
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), new TextEncoder().encode(data));
  return `${data}.${b64url(sig)}`;
}

async function verifyJwt(secret: string, token: string, typ: "access" | "refresh"): Promise<JwtClaims | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, payload, sig] = parts;
  const valid = await crypto.subtle.verify(
    "HMAC",
    await hmacKey(secret),
    fromB64url(sig),
    new TextEncoder().encode(`${header}.${payload}`),
  );
  if (!valid) return null;
  const claims = JSON.parse(new TextDecoder().decode(fromB64url(payload))) as JwtClaims;
  if (claims.typ !== typ) return null;
  if (claims.exp * 1000 < Date.now()) return null;
  return claims;
}

async function issueTokens(env: Env, userId: string): Promise<AuthTokens> {
  const secret = env.JWT_SIGNING_SECRET ?? "dev-only-change-me";
  const now = Math.floor(Date.now() / 1000);
  return {
    accessToken: await signJwt(secret, { sub: userId, typ: "access", exp: now + ACCESS_TTL }),
    refreshToken: await signJwt(secret, { sub: userId, typ: "refresh", exp: now + REFRESH_TTL }),
    expiresIn: ACCESS_TTL,
  };
}

// --- password hashing (PBKDF2-SHA256) ---
async function hashPassword(password: string, saltHex?: string): Promise<{ hash: string; salt: string }> {
  const salt = saltHex ? fromHex(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 100_000, hash: "SHA-256" },
    keyMaterial,
    256,
  );
  return { hash: toHex(new Uint8Array(bits)), salt: toHex(salt) };
}
function toHex(b: Uint8Array): string {
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}
function fromHex(h: string): Uint8Array {
  return new Uint8Array((h.match(/.{1,2}/g) ?? []).map((x) => parseInt(x, 16)));
}
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// --- customer factory ---
function newCustomer(email: string, firstName: string, lastName?: string, phone?: string): Customer {
  const id = crypto.randomUUID();
  return {
    id,
    // Production: create/link a Square customer and store its id here.
    squareCustomerId: `mock-cust-${id.slice(0, 8)}`,
    email,
    firstName,
    lastName,
    phone,
    createdAt: new Date().toISOString(),
  };
}

async function authResponse(env: Env, user: StoredUser): Promise<AuthResponse> {
  const tokens = await issueTokens(env, user.customer.id);
  return { ...tokens, customer: user.customer };
}

// --- handlers ---
export async function register(req: Request, env: Env): Promise<Response> {
  const body = (await req.json()) as RegisterRequest;
  if (!body.email || !body.password || !body.firstName) {
    return error("VALIDATION_FAILED", "email, password and firstName are required", 422);
  }
  if (body.password.length < 8) {
    return error("VALIDATION_FAILED", "Password must be at least 8 characters", 422);
  }
  if (store.getUserByEmail(body.email)) {
    return error("CONFLICT", "An account with that email already exists", 409);
  }
  const { hash, salt } = await hashPassword(body.password);
  const user: StoredUser = {
    customer: newCustomer(body.email, body.firstName, body.lastName, body.phone),
    passwordHash: hash,
    passwordSalt: salt,
    stars: 0,
    pushTokens: [],
  };
  store.putUser(user);
  return json(await authResponse(env, user), 201);
}

export async function login(req: Request, env: Env): Promise<Response> {
  const body = (await req.json()) as LoginRequest;
  const user = store.getUserByEmail(body.email ?? "");
  if (!user || !user.passwordHash || !user.passwordSalt) {
    return error("UNAUTHENTICATED", "Invalid email or password", 401);
  }
  const { hash } = await hashPassword(body.password ?? "", user.passwordSalt);
  if (!constantTimeEqual(hash, user.passwordHash)) {
    return error("UNAUTHENTICATED", "Invalid email or password", 401);
  }
  return json(await authResponse(env, user));
}

export async function appleAuth(req: Request, env: Env): Promise<Response> {
  const body = (await req.json()) as AppleAuthRequest;
  if (!body.identityToken) {
    return error("VALIDATION_FAILED", "identityToken is required", 422);
  }
  // Production MUST verify the Apple identity token against Apple's public keys
  // (audience = our bundle id, issuer = https://appleid.apple.com) before trust.
  // Dev/mock: decode the JWT payload to get a stable sub + email.
  const claims = decodeUnverified(body.identityToken);
  const email = claims.email ?? `apple_${claims.sub}@privaterelay.appleid.com`;
  let user = store.getUserByEmail(email);
  if (!user) {
    user = {
      customer: newCustomer(email, body.firstName ?? "Guest", body.lastName),
      stars: 0,
      pushTokens: [],
    };
    store.putUser(user);
  }
  return json(await authResponse(env, user));
}

export async function refresh(req: Request, env: Env): Promise<Response> {
  const body = (await req.json()) as RefreshRequest;
  const secret = env.JWT_SIGNING_SECRET ?? "dev-only-change-me";
  const claims = await verifyJwt(secret, body.refreshToken ?? "", "refresh");
  if (!claims) return error("UNAUTHENTICATED", "Invalid or expired refresh token", 401);
  return json(await issueTokens(env, claims.sub));
}

export async function me(req: Request, env: Env): Promise<Response> {
  const user = await requireAuth(req, env);
  if (!user) return error("UNAUTHENTICATED", "Sign in required", 401);
  return json(user.customer);
}

/** Returns the authenticated user, or null. Use at the top of protected handlers. */
export async function requireAuth(req: Request, env: Env): Promise<StoredUser | null> {
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const secret = env.JWT_SIGNING_SECRET ?? "dev-only-change-me";
  const claims = await verifyJwt(secret, header.slice(7), "access");
  if (!claims) return null;
  return store.getUser(claims.sub) ?? null;
}

function decodeUnverified(jwt: string): { sub: string; email?: string } {
  try {
    const payload = jwt.split(".")[1];
    const obj = JSON.parse(new TextDecoder().decode(fromB64url(payload)));
    return { sub: obj.sub ?? "unknown", email: obj.email };
  } catch {
    return { sub: "unknown" };
  }
}
