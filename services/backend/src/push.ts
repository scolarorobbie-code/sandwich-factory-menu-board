import type { Env } from "./env";
import { store, type DeviceToken } from "./store";

/**
 * Notifications. Two audiences (per CLAUDE.md):
 *  (a) STAFF alert the instant an order is placed → the store tablet.
 *  (b) CUSTOMER push as the order status changes → their device(s).
 *
 * Delivery rides Expo's push service (one endpoint covers both APNs + FCM, so a
 * single token type works iOS + Android). A staff ntfy.sh topic is a BACKUP
 * channel for new-order alerts. In mock/dev (no real tokens) the Expo call is
 * skipped and we just log, so the whole flow is observable without a device.
 *
 * Real delivery needs a real ExponentPushToken, which only exists on an EAS dev
 * build running on a PHYSICAL device (Expo Go / simulators can't get APNs/FCM
 * tokens). Until then the customer's pushTokens are "mock-..." and we log only.
 */

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_BATCH_SIZE = 100; // Expo accepts up to 100 messages per request.

interface PushMessage {
  to: string; // ExponentPushToken[...]
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: "default";
}

/** A token is a real Expo token (vs. a dev/mock placeholder) we should POST. */
function isRealExpoToken(token: string): boolean {
  return token.startsWith("ExponentPushToken[") || token.startsWith("ExpoPushToken[");
}

/** Shape of a single ticket in Expo's push response. */
interface ExpoTicket {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
}

/**
 * POST messages to Expo in batches, read the ticket response, and report back
 * which tokens Expo says are dead (DeviceNotRegistered) so the caller can drop
 * them. Best-effort: a network/Expo error never throws to the caller.
 */
async function sendExpo(messages: PushMessage[]): Promise<{ invalidTokens: string[] }> {
  const invalidTokens: string[] = [];
  if (messages.length === 0) return { invalidTokens };

  // Dev/mock: when nothing has a real Expo token, just log so the flow is
  // visible without a device or network call.
  if (!messages.some((m) => isRealExpoToken(m.to))) {
    for (const m of messages) console.log(`[push:mock] ${m.title} — ${m.body} -> ${m.to}`);
    return { invalidTokens };
  }

  const real = messages.filter((m) => isRealExpoToken(m.to));
  for (let i = 0; i < real.length; i += EXPO_BATCH_SIZE) {
    const batch = real.slice(i, i + EXPO_BATCH_SIZE);
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(batch.map((m) => ({ sound: "default", ...m }))),
      });
      if (!res.ok) {
        console.warn(`[push] Expo returned ${res.status}: ${await res.text().catch(() => "")}`);
        continue;
      }
      const json = (await res.json().catch(() => null)) as { data?: ExpoTicket[] } | null;
      const tickets = json?.data ?? [];
      // Tickets line up positionally with the messages we sent in this batch.
      tickets.forEach((t, idx) => {
        if (t.status === "error") {
          const token = batch[idx]?.to;
          console.warn(`[push] ticket error for ${token}: ${t.message ?? t.details?.error}`);
          // Token is dead (uninstalled / token rotated) — drop it.
          if (token && t.details?.error === "DeviceNotRegistered") invalidTokens.push(token);
        }
      });
    } catch (err) {
      console.warn(`[push] Expo send failed: ${err instanceof Error ? err.message : err}`);
    }
  }
  return { invalidTokens };
}

/**
 * (a) Tell the STAFF tablet a new order arrived.
 *
 * Targets, in order: every device registered as staff (POST /devices
 * { staff:true }) PLUS a fixed STAFF_PUSH_TOKEN env if the owner set one.
 * ntfy.sh is fired as a backup channel regardless, so the kitchen still hears
 * about the order even if no Expo staff token is configured yet.
 */
export async function notifyStaffNewOrder(env: Env, displayNumber: string, itemCount: number): Promise<void> {
  const itemLabel = `${itemCount} item${itemCount === 1 ? "" : "s"}`;
  console.log(`[staff] New order #${displayNumber} (${itemLabel})`);

  const targets: DeviceToken[] = [...store.listStaffTokens()];
  if (env.STAFF_PUSH_TOKEN && !targets.some((t) => t.token === env.STAFF_PUSH_TOKEN)) {
    // Platform is cosmetic for Expo; "ios" is a safe default for the env token.
    targets.push({ token: env.STAFF_PUSH_TOKEN, platform: "ios" });
  }

  const { invalidTokens } = await sendExpo(
    targets.map((t) => ({
      to: t.token,
      title: `New order #${displayNumber}`,
      body: `${itemLabel} — start when ready`,
      data: { kind: "staff-new-order", displayNumber },
    })),
  );
  dropStaffTokens(invalidTokens);

  // Backup channel — always attempt, independent of Expo.
  await sendStaffNtfy(env, `New order #${displayNumber}`, `${itemLabel} — start when ready`);
}

/** (b) Tell the CUSTOMER their order status changed. */
export async function notifyCustomerStatus(
  _env: Env,
  tokens: DeviceToken[],
  displayNumber: string,
  message: string,
): Promise<void> {
  const { invalidTokens } = await sendExpo(
    tokens.map((t) => ({
      to: t.token,
      title: `Order #${displayNumber}`,
      body: message,
      data: { kind: "order-status", displayNumber },
    })),
  );
  // Caller owns the customer's token list; we just log dead ones here. (Dropping
  // them per-user would require the StoredUser; status pushes are low-volume so
  // a stale token simply no-ops on the next send.)
  if (invalidTokens.length) console.log(`[push] ${invalidTokens.length} dead customer token(s)`);
}

/** Remove staff tablet tokens Expo reported as dead. */
function dropStaffTokens(tokens: string[]): void {
  if (tokens.length === 0) return;
  const live = store.listStaffTokens().filter((t) => !tokens.includes(t.token));
  store.replaceStaffTokens(live);
}

async function sendStaffNtfy(env: Env, title: string, body: string): Promise<void> {
  const topic = env.NTFY_TOPIC;
  if (!topic) return;
  try {
    await fetch(`https://ntfy.sh/${encodeURIComponent(topic)}`, {
      method: "POST",
      headers: { Title: title, Priority: "high" },
      body,
    });
  } catch (err) {
    console.warn(`[push] ntfy backup failed: ${err instanceof Error ? err.message : err}`);
  }
}
