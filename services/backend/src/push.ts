import type { Env } from "./env";

/**
 * Notifications. Two audiences (per CLAUDE.md):
 *  (a) staff alert the instant an order is placed
 *  (b) customer push as the order status changes
 *
 * Uses Expo's push API (works for both APNs + FCM). A staff ntfy.sh topic is a
 * backup channel. In mock/dev (no tokens) these just log so the flow is visible.
 */

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

interface PushMessage {
  to: string; // ExponentPushToken[...]
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: "default";
}

async function sendExpo(env: Env, messages: PushMessage[]): Promise<void> {
  if (messages.length === 0) return;
  if (env.SQUARE_ENVIRONMENT === "sandbox" && messages.every((m) => m.to.startsWith("mock-"))) {
    for (const m of messages) console.log(`[push:mock] ${m.title} — ${m.body} -> ${m.to}`);
    return;
  }
  await fetch(EXPO_PUSH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(messages.map((m) => ({ sound: "default", ...m }))),
  });
}

/** (a) Tell the staff tablet a new order arrived. */
export async function notifyStaffNewOrder(env: Env, displayNumber: string, itemCount: number): Promise<void> {
  // Production: store tablet's Expo token(s) live in config/KV. ntfy backup below.
  console.log(`[staff] New order #${displayNumber} (${itemCount} item${itemCount === 1 ? "" : "s"})`);
  await sendStaffNtfy(env, `New order #${displayNumber}`, `${itemCount} item(s) — start when ready`);
}

/** (b) Tell the customer their order status changed. */
export async function notifyCustomerStatus(
  env: Env,
  tokens: { token: string; platform: "ios" | "android" }[],
  displayNumber: string,
  message: string,
): Promise<void> {
  await sendExpo(
    env,
    tokens.map((t) => ({
      to: t.token,
      title: `Order #${displayNumber}`,
      body: message,
      data: { displayNumber },
    })),
  );
}

async function sendStaffNtfy(env: Env, title: string, body: string): Promise<void> {
  const topic = (env as { NTFY_TOPIC?: string }).NTFY_TOPIC;
  if (!topic) return;
  await fetch(`https://ntfy.sh/${topic}`, {
    method: "POST",
    headers: { Title: title, Priority: "high" },
    body,
  });
}
