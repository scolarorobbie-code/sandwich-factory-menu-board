import type { Loyalty, LoyaltyReward, Money } from "@sf/contract";
import type { Env } from "./env";
import { squareFetch } from "./square";

/**
 * Square Loyalty ("Stars") client. Square is the SOURCE OF TRUTH for loyalty —
 * we never keep our own points ledger in production. Everything here is a thin
 * wrapper over Square's Loyalty API built on the shared `squareFetch`.
 *
 * Hard rules respected:
 *  - Secrets stay backend-only (squareFetch injects the token).
 *  - Idempotency-Key on every create call.
 *  - Never hardcode the location id — always `env.SQUARE_LOCATION_ID`.
 *
 * GRACEFUL DEGRADATION: a Square sandbox may have NO loyalty program configured.
 * Every function fails soft — it returns null/empty and never throws — so a
 * missing program can never break an order or a payment.
 */

const usd = (cents: number | bigint | undefined): Money => ({ amount: Number(cents ?? 0), currency: "USD" });

// --- Square Loyalty response shapes (only the fields we read) ---
interface SquareLoyaltyProgram {
  id: string;
  status?: string; // "ACTIVE" | "INACTIVE"
  terminology?: { one?: string; other?: string };
  accrual_rules?: {
    accrual_type?: string; // "SPEND" | "VISIT" | "ITEM_VARIATION" | "CATEGORY"
    points?: number;
    spend_data?: { amount_money?: { amount?: number } };
  }[];
  reward_tiers?: {
    id: string;
    name?: string;
    points?: number;
    definition?: {
      discount_type?: string; // "FIXED_AMOUNT" | "FIXED_PERCENTAGE" | ...
      fixed_discount_money?: { amount?: number };
      percentage_discount?: string;
    };
    pricing_rule_reference?: unknown;
  }[];
}

interface SquareLoyaltyAccount {
  id: string;
  balance?: number;
  program_id?: string;
}

interface SquareLoyaltyReward {
  id: string;
  status?: string;
  loyalty_account_id?: string;
  reward_tier_id?: string;
  points?: number;
  order_id?: string;
}

/** A loyalty program plus its derived earn rule and reward tiers in our shape. */
export interface LoyaltySnapshot {
  programId: string;
  earnRule: string;
  rewards: LoyaltyReward[];
  /** Map our reward id (== Square reward_tier_id) -> stars cost. */
  tierCost: Map<string, number>;
}

/**
 * Pure reward-tier selection: pick the most valuable reward the customer can
 * actually afford. A tier is affordable when its `cost` is positive AND fits
 * both the live `balance` and the `redeemCap` the customer chose to spend.
 * Returns the highest-cost affordable tier, or null when none fits (e.g. the
 * balance is below the cheapest tier). Extracted so it can be unit-tested
 * without the Square API round-trips around it.
 */
export function bestAffordableReward(
  rewards: LoyaltyReward[],
  balance: number,
  redeemCap: number,
): LoyaltyReward | null {
  return (
    rewards
      .filter((r) => r.cost > 0 && r.cost <= balance && r.cost <= redeemCap)
      .sort((a, b) => b.cost - a.cost)[0] ?? null
  );
}

/**
 * Fetch the merchant's loyalty program. Returns null when there is no ACTIVE
 * program (e.g. a bare sandbox) so callers fall back to "no loyalty".
 */
export async function getLoyaltyProgram(env: Env): Promise<LoyaltySnapshot | null> {
  try {
    // "main" is Square's alias for the single program on the account.
    const res = await squareFetch(env, "/v2/loyalty/programs/main", { method: "GET" });
    if (!res.ok) return null;
    const data = (await res.json()) as { program?: SquareLoyaltyProgram };
    const program = data.program;
    if (!program || program.status !== "ACTIVE") return null;
    return toSnapshot(program);
  } catch {
    return null; // network/program issues never break loyalty-dependent flows
  }
}

function toSnapshot(program: SquareLoyaltyProgram): LoyaltySnapshot {
  const unit = program.terminology?.one ?? "Star";
  const units = program.terminology?.other ?? "Stars";

  // Derive a human earn rule from the first SPEND accrual rule when present.
  let earnRule = `Earn ${units} on every order`;
  const spend = program.accrual_rules?.find((r) => r.accrual_type === "SPEND");
  if (spend?.spend_data?.amount_money?.amount) {
    const dollars = spend.spend_data.amount_money.amount / 100;
    const pts = spend.points ?? 1;
    earnRule = `${pts} ${pts === 1 ? unit : units} per $${dollars % 1 === 0 ? dollars : dollars.toFixed(2)}`;
  }

  const tierCost = new Map<string, number>();
  const rewards: LoyaltyReward[] = (program.reward_tiers ?? []).map((t) => {
    const cost = t.points ?? 0;
    tierCost.set(t.id, cost);
    const def = t.definition;
    const value =
      def?.discount_type === "FIXED_AMOUNT"
        ? usd(def.fixed_discount_money?.amount)
        : usd(0); // percentage/category discounts: value is order-dependent, shown as $0 here
    return {
      id: t.id,
      name: t.name ?? `${cost} ${cost === 1 ? unit : units}`,
      cost,
      value,
    };
  });

  return { programId: program.id, earnRule, rewards, tierCost };
}

/**
 * Find an existing Square loyalty account by phone, or create one.
 * Returns the account id, or null on any failure (no program, bad phone, etc.).
 *
 * Phone must be E.164 (e.g. +16154941211) for Square. We try to coerce a bare
 * 10-digit US number; anything else is left as-is and Square may reject it
 * (which we swallow → null).
 */
export async function findOrCreateLoyaltyAccount(
  env: Env,
  programId: string,
  phone: string | undefined,
): Promise<string | null> {
  const e164 = toE164(phone);
  if (!e164) return null; // Square loyalty accounts are keyed on a phone mapping
  try {
    // 1. Search for an existing account by phone.
    const search = await squareFetch(env, "/v2/loyalty/accounts/search", {
      method: "POST",
      body: JSON.stringify({ query: { mappings: [{ phone_number: e164 }] } }),
    });
    if (search.ok) {
      const data = (await search.json()) as { loyalty_accounts?: SquareLoyaltyAccount[] };
      const existing = data.loyalty_accounts?.[0];
      if (existing?.id) return existing.id;
    }

    // 2. None found → create one.
    const create = await squareFetch(env, "/v2/loyalty/accounts", {
      method: "POST",
      body: JSON.stringify({
        idempotency_key: crypto.randomUUID(),
        loyalty_account: { program_id: programId, mapping: { phone_number: e164 } },
      }),
    });
    if (!create.ok) return null;
    const created = (await create.json()) as { loyalty_account?: SquareLoyaltyAccount };
    return created.loyalty_account?.id ?? null;
  } catch {
    return null;
  }
}

/** Current redeemable balance for an account, or null on failure. */
export async function getAccountBalance(env: Env, accountId: string): Promise<number | null> {
  try {
    const res = await squareFetch(env, `/v2/loyalty/accounts/${accountId}`, { method: "GET" });
    if (!res.ok) return null;
    const data = (await res.json()) as { loyalty_account?: SquareLoyaltyAccount };
    return data.loyalty_account?.balance ?? null;
  } catch {
    return null;
  }
}

/**
 * Accumulate points for a paid order. Square calculates the points itself from
 * the program's accrual rules + the order total — we just tell it which order
 * to score against. Returns the points accrued (best-effort), or null.
 *
 * Idempotent on `idempotencyKey` so a retried payment never double-earns.
 */
export async function accumulatePoints(
  env: Env,
  accountId: string,
  squareOrderId: string,
  idempotencyKey: string,
): Promise<number | null> {
  try {
    const res = await squareFetch(env, `/v2/loyalty/accounts/${accountId}/accumulate`, {
      method: "POST",
      body: JSON.stringify({
        idempotency_key: idempotencyKey,
        accumulate_points: { order_id: squareOrderId },
        location_id: env.SQUARE_LOCATION_ID,
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      events?: { loyalty_event_accumulate_points?: { points?: number } }[];
    };
    // Sum points across the returned accrual events.
    const points = (data.events ?? []).reduce(
      (s, e) => s + (e.loyalty_event_accumulate_points?.points ?? 0),
      0,
    );
    return points;
  } catch {
    return null;
  }
}

/**
 * Redeem a reward: create a Square loyalty reward against an order. Square
 * deducts the points and attaches the reward's discount to the order, so the
 * order's totals reflect the redemption authoritatively. Returns the reward id
 * (and the points spent), or null when it can't be applied.
 */
export async function redeemReward(
  env: Env,
  accountId: string,
  rewardTierId: string,
  squareOrderId: string,
  idempotencyKey: string,
): Promise<{ rewardId: string } | null> {
  try {
    const res = await squareFetch(env, "/v2/loyalty/rewards", {
      method: "POST",
      body: JSON.stringify({
        idempotency_key: idempotencyKey,
        reward: {
          loyalty_account_id: accountId,
          reward_tier_id: rewardTierId,
          order_id: squareOrderId,
        },
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { reward?: SquareLoyaltyReward };
    const id = data.reward?.id;
    return id ? { rewardId: id } : null;
  } catch {
    return null;
  }
}

/**
 * Build the public Loyalty view for a customer. In LIVE mode this reads the
 * real program + the customer's Square balance; if there is no program (or no
 * account yet) it falls back to the supplied local balance so the screen still
 * renders. Branding stays "Stars".
 */
export async function getLoyaltyView(
  env: Env,
  accountId: string | undefined,
  localStars: number,
): Promise<Loyalty> {
  const program = await getLoyaltyProgram(env);
  if (!program) {
    // No Square program configured — show the local/mock balance.
    return {
      stars: localStars,
      earnRule: "1 Star per $1 spent",
      rewards: [
        { id: "reward-5", name: "$5 off", cost: 50, value: { amount: 500, currency: "USD" } },
        { id: "reward-10", name: "$10 off", cost: 100, value: { amount: 1000, currency: "USD" } },
      ],
    };
  }
  let stars = localStars;
  if (accountId) {
    const balance = await getAccountBalance(env, accountId);
    if (balance !== null) stars = balance;
  }
  return { stars, earnRule: program.earnRule, rewards: program.rewards };
}

/** Best-effort E.164 coercion. Bare 10-digit US numbers → +1XXXXXXXXXX. */
function toE164(phone: string | undefined): string | null {
  if (!phone) return null;
  const trimmed = phone.trim();
  if (/^\+[1-9]\d{6,14}$/.test(trimmed)) return trimmed;
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}
