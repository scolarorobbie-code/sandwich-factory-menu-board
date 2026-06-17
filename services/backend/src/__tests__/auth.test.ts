import type { AuthResponse, AuthTokens, Customer } from "@sf/contract";
import { beforeEach, describe, expect, it } from "vitest";
import {
  login,
  me,
  refresh,
  register,
  signJwt,
  timingSafeEqual,
  updateProfile,
  verifyJwt,
  type JwtClaims,
} from "../auth";
import { store } from "../store";
import { mockEnv } from "./fixtures";

const SECRET = "test-jwt-secret";

function jsonRequest(url: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function future(seconds = 3600): number {
  return Math.floor(Date.now() / 1000) + seconds;
}

describe("signJwt / verifyJwt roundtrip", () => {
  it("verifies an access token signed with the same secret", async () => {
    const claims: JwtClaims = { sub: "user-1", typ: "access", exp: future() };
    const token = await signJwt(SECRET, claims);
    const out = await verifyJwt(SECRET, token, "access");
    expect(out).not.toBeNull();
    expect(out?.sub).toBe("user-1");
    expect(out?.typ).toBe("access");
  });

  it("verifies an admin token requiring the admin typ", async () => {
    const token = await signJwt(SECRET, { sub: "admin", typ: "admin", exp: future() });
    const out = await verifyJwt(SECRET, token, "admin");
    expect(out?.sub).toBe("admin");
    expect(out?.typ).toBe("admin");
  });

  it("rejects when the required typ does not match the token", async () => {
    const token = await signJwt(SECRET, { sub: "user-1", typ: "access", exp: future() });
    // Same valid token, but asked for as a refresh token -> rejected.
    expect(await verifyJwt(SECRET, token, "refresh")).toBeNull();
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await signJwt("other-secret", { sub: "user-1", typ: "access", exp: future() });
    expect(await verifyJwt(SECRET, token, "access")).toBeNull();
  });

  it("rejects an expired token", async () => {
    const token = await signJwt(SECRET, { sub: "user-1", typ: "access", exp: future(-10) });
    expect(await verifyJwt(SECRET, token, "access")).toBeNull();
  });

  it("rejects a tampered payload", async () => {
    const token = await signJwt(SECRET, { sub: "user-1", typ: "access", exp: future() });
    const [header, , sig] = token.split(".");
    // Forge a different payload but keep the original signature.
    const forged = btoa(JSON.stringify({ sub: "admin", typ: "admin", exp: future() }))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    const tampered = `${header}.${forged}.${sig}`;
    expect(await verifyJwt(SECRET, tampered, "admin")).toBeNull();
  });

  it("rejects a malformed token (wrong number of segments)", async () => {
    expect(await verifyJwt(SECRET, "not.a.valid.jwt", "access")).toBeNull();
    expect(await verifyJwt(SECRET, "onlyonepart", "access")).toBeNull();
  });
});

describe("timingSafeEqual", () => {
  it("is true for identical strings", () => {
    expect(timingSafeEqual("abc123", "abc123")).toBe(true);
  });

  it("is false for differing strings of equal length", () => {
    expect(timingSafeEqual("abc123", "abc124")).toBe(false);
  });

  it("is false for strings of differing length", () => {
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
  });
});

describe("password hashing via register/login (PBKDF2-SHA256)", () => {
  beforeEach(() => store.reset());

  it("registers a new user, hashes the password, and lets them log in", async () => {
    const env = mockEnv({ JWT_SIGNING_SECRET: SECRET });
    const reg = await register(
      jsonRequest("https://api.test/auth/register", {
        email: "Pat@Example.com",
        password: "supersecret",
        firstName: "Pat",
        phone: "+16154941211",
      }),
      env,
    );
    expect(reg.status).toBe(201);
    const regBody = (await reg.json()) as AuthResponse;
    expect(regBody.customer.email).toBe("Pat@Example.com");
    expect(regBody.accessToken).toBeTruthy();
    expect(regBody.refreshToken).toBeTruthy();

    // The stored password hash must not be the plaintext.
    const stored = store.getUserByEmail("pat@example.com");
    expect(stored?.passwordHash).toBeTruthy();
    expect(stored?.passwordHash).not.toBe("supersecret");
    expect(stored?.passwordSalt).toBeTruthy();

    // Correct password logs in (verifies hash+salt roundtrip).
    const ok = await login(
      jsonRequest("https://api.test/auth/login", {
        email: "pat@example.com",
        password: "supersecret",
      }),
      env,
    );
    expect(ok.status).toBe(200);
    const okBody = (await ok.json()) as AuthResponse;
    expect(okBody.customer.id).toBe(regBody.customer.id);
  });

  it("rejects login with the wrong password", async () => {
    const env = mockEnv({ JWT_SIGNING_SECRET: SECRET });
    await register(
      jsonRequest("https://api.test/auth/register", {
        email: "pat@example.com",
        password: "supersecret",
        firstName: "Pat",
      }),
      env,
    );
    const bad = await login(
      jsonRequest("https://api.test/auth/login", {
        email: "pat@example.com",
        password: "wrongpassword",
      }),
      env,
    );
    expect(bad.status).toBe(401);
  });

  it("rejects login for an unknown email", async () => {
    const env = mockEnv({ JWT_SIGNING_SECRET: SECRET });
    const res = await login(
      jsonRequest("https://api.test/auth/login", { email: "nobody@example.com", password: "x" }),
      env,
    );
    expect(res.status).toBe(401);
  });
});

describe("register validation + conflicts", () => {
  beforeEach(() => store.reset());

  it("422s when required fields are missing", async () => {
    const res = await register(
      jsonRequest("https://api.test/auth/register", { email: "a@b.com" }),
      mockEnv(),
    );
    expect(res.status).toBe(422);
  });

  it("422s on a too-short password", async () => {
    const res = await register(
      jsonRequest("https://api.test/auth/register", {
        email: "a@b.com",
        password: "short",
        firstName: "A",
      }),
      mockEnv(),
    );
    expect(res.status).toBe(422);
  });

  it("409s on a duplicate email", async () => {
    const env = mockEnv({ JWT_SIGNING_SECRET: SECRET });
    const body = { email: "dupe@example.com", password: "supersecret", firstName: "Dupe" };
    const first = await register(jsonRequest("https://api.test/auth/register", body), env);
    expect(first.status).toBe(201);
    const second = await register(jsonRequest("https://api.test/auth/register", body), env);
    expect(second.status).toBe(409);
  });
});

describe("me + refresh", () => {
  beforeEach(() => store.reset());

  async function registerUser(): Promise<{
    env: ReturnType<typeof mockEnv>;
    tokens: AuthTokens;
    customer: Customer;
  }> {
    const env = mockEnv({ JWT_SIGNING_SECRET: SECRET });
    const reg = await register(
      jsonRequest("https://api.test/auth/register", {
        email: "me@example.com",
        password: "supersecret",
        firstName: "Me",
      }),
      env,
    );
    const body = (await reg.json()) as AuthResponse;
    return { env, tokens: body, customer: body.customer };
  }

  it("returns the customer for a valid access token", async () => {
    const { env, tokens, customer } = await registerUser();
    const res = await me(
      new Request("https://api.test/me", {
        headers: { authorization: `Bearer ${tokens.accessToken}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const out = (await res.json()) as Customer;
    expect(out.id).toBe(customer.id);
    expect(out.email).toBe("me@example.com");
  });

  it("401s on a missing/invalid Authorization header", async () => {
    const { env } = await registerUser();
    const noHeader = await me(new Request("https://api.test/me"), env);
    expect(noHeader.status).toBe(401);
    const bad = await me(
      new Request("https://api.test/me", { headers: { authorization: "Bearer garbage" } }),
      env,
    );
    expect(bad.status).toBe(401);
  });

  it("401s when a refresh token is presented to me (wrong typ)", async () => {
    const { env, tokens } = await registerUser();
    const res = await me(
      new Request("https://api.test/me", {
        headers: { authorization: `Bearer ${tokens.refreshToken}` },
      }),
      env,
    );
    expect(res.status).toBe(401);
  });

  it("issues fresh tokens from a valid refresh token", async () => {
    const { env, tokens, customer } = await registerUser();
    const res = await refresh(
      jsonRequest("https://api.test/auth/refresh", { refreshToken: tokens.refreshToken }),
      env,
    );
    expect(res.status).toBe(200);
    const out = (await res.json()) as AuthTokens;
    expect(out.accessToken).toBeTruthy();
    expect(out.refreshToken).toBeTruthy();
    // The fresh access token verifies and resolves to the same user.
    const claims = await verifyJwt(SECRET, out.accessToken, "access");
    expect(claims?.sub).toBe(customer.id);
  });

  it("401s refresh when given an access token instead of a refresh token", async () => {
    const { env, tokens } = await registerUser();
    const res = await refresh(
      jsonRequest("https://api.test/auth/refresh", { refreshToken: tokens.accessToken }),
      env,
    );
    expect(res.status).toBe(401);
  });
});

describe("updateProfile (PATCH /me)", () => {
  beforeEach(() => store.reset());

  async function registerStored(): Promise<{ env: ReturnType<typeof mockEnv>; user: NonNullable<ReturnType<typeof store.getUser>> }> {
    const env = mockEnv({ JWT_SIGNING_SECRET: SECRET });
    const reg = await register(
      jsonRequest("https://api.test/auth/register", {
        email: "pat@example.com",
        password: "supersecret",
        firstName: "Pat",
      }),
      env,
    );
    const body = (await reg.json()) as AuthResponse;
    const user = store.getUser(body.customer.id)!;
    return { env, user };
  }

  function patch(body: unknown): Request {
    return new Request("https://api.test/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("updates name and phone, persisting to the store", async () => {
    const { env, user } = await registerStored();
    const res = await updateProfile(patch({ firstName: "Patricia", phone: "(615) 494-1211" }), env, user);
    expect(res.status).toBe(200);
    const out = (await res.json()) as Customer;
    expect(out.firstName).toBe("Patricia");
    expect(out.phone).toBe("(615) 494-1211");
    // Persisted: a fresh read of the user reflects the change.
    expect(store.getUser(user.customer.id)?.customer.phone).toBe("(615) 494-1211");
  });

  it("leaves unspecified fields unchanged", async () => {
    const { env, user } = await registerStored();
    const res = await updateProfile(patch({ phone: "615-555-0100" }), env, user);
    const out = (await res.json()) as Customer;
    expect(out.firstName).toBe("Pat"); // untouched
    expect(out.phone).toBe("615-555-0100");
  });

  it("rejects an empty first name and an invalid phone", async () => {
    const { env, user } = await registerStored();
    expect((await updateProfile(patch({ firstName: "  " }), env, user)).status).toBe(422);
    expect((await updateProfile(patch({ phone: "abc" }), env, user)).status).toBe(422);
  });

  it("clears phone when sent an empty string", async () => {
    const { env, user } = await registerStored();
    await updateProfile(patch({ phone: "615-555-0100" }), env, user);
    const res = await updateProfile(patch({ phone: "" }), env, user);
    const out = (await res.json()) as Customer;
    expect(out.phone).toBeUndefined();
  });
});
