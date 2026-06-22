/**
 * Crash-proof wrapper around expo-notifications (push registration + foreground
 * display). Mirrors src/haptics.ts: the native module is absent in some Expo Go
 * / web contexts, so it's required LAZILY and EVERY call is wrapped so a missing
 * module, denied permission, or offline device can never crash the app.
 *
 * ⚠️ Real Expo push tokens only exist on an EAS dev/standalone build running on
 * a PHYSICAL device — Expo Go and simulators cannot mint APNs/FCM tokens. In
 * those environments getExpoPushToken() returns null and we log a clear dev
 * note; the rest of the app is unaffected. The backend treats "no token" as a
 * no-op (it just can't push that device until a real build is installed).
 */
import { Platform } from "react-native";
import { api } from "./api/client";

type Notifications = typeof import("expo-notifications");
type Constants = typeof import("expo-constants");

// Lazily resolved so a missing/native-less module can't crash module load.
let notifMod: Notifications | null | undefined;
function notifications(): Notifications | null {
  if (notifMod === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      notifMod = require("expo-notifications") as Notifications;
    } catch {
      notifMod = null;
    }
  }
  return notifMod ?? null;
}

// Push only exists on real mobile devices; skip on web entirely.
const supported = Platform.OS === "ios" || Platform.OS === "android";

/**
 * Android channel id used for ALL order-related pushes. Android REQUIRES a
 * channel for heads-up display + sound; without one, notifications arrive
 * silently (or are dropped on Android 8+). iOS ignores channels entirely.
 */
export const ANDROID_DEFAULT_CHANNEL = "default";

let handlerInstalled = false;
let androidChannelReady = false;

/**
 * Create the default Android notification channel ONCE (idempotent, best-effort).
 *
 * Android (8.0+) drops any notification not bound to a channel, and the
 * channel — not the message — owns importance, sound and vibration. We use HIGH
 * importance so order updates pop as a heads-up banner with sound + vibration.
 * No-op on iOS/web (channels don't exist there) and crash-proof.
 *
 * NOTE: creating the channel is all the APP can do. ACTUAL push DELIVERY on
 * Android additionally requires FCM credentials (a Firebase project +
 * google-services.json uploaded to EAS) — see docs/EAS_AND_PAYMENTS.md. Without
 * FCM the channel still governs how locally-presented notifications look.
 */
async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== "android" || androidChannelReady) return;
  try {
    const N = notifications();
    if (!N) return;
    await N.setNotificationChannelAsync(ANDROID_DEFAULT_CHANNEL, {
      name: "Order updates",
      description: "New-order alerts and pickup status for your Sandwich Factory orders.",
      importance: N.AndroidImportance.HIGH,
      sound: "default",
      enableVibrate: true,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#E4572E",
      lockscreenVisibility: N.AndroidNotificationVisibility.PUBLIC,
    });
    androidChannelReady = true;
  } catch (err) {
    // Channel is best-effort; a failure must never block startup or pushes.
    console.log("[push] android channel setup skipped:", errMessage(err));
  }
}

/**
 * Install the foreground notification handler + (on Android) the notification
 * channel ONCE (idempotent). Without the handler, notifications received while
 * the app is open are silently dropped on iOS; without the channel, Android
 * suppresses heads-up display + sound. Safe to call at app start regardless of
 * permission/sign-in state. Crash-proof / no-op on web + Expo Go.
 */
export function setupNotifications(): void {
  if (!supported) return;
  // The Android channel is independent of the foreground handler — ensure it
  // even when the handler is already installed (e.g. a later re-entry).
  void ensureAndroidChannel();
  if (handlerInstalled) return;
  try {
    const N = notifications();
    if (!N) return;
    N.setNotificationHandler({
      handleNotification: async () => ({
        // SDK 56 fields: show the banner + list it, play a sound, no badge.
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        // Back-compat alias for older runtimes (deprecated but harmless).
        shouldShowAlert: true,
      }),
    });
    handlerInstalled = true;
  } catch (err) {
    console.log("[push] handler setup skipped:", errMessage(err));
  }
}

/** Resolve the EAS projectId from app config (needed by getExpoPushTokenAsync). */
function projectId(): string | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Constants = require("expo-constants") as Constants;
    const c = Constants.default ?? (Constants as unknown as Constants["default"]);
    return (
      c?.expoConfig?.extra?.eas?.projectId ??
      (c?.easConfig as { projectId?: string } | undefined)?.projectId ??
      undefined
    );
  } catch {
    return undefined;
  }
}

/**
 * Request permission and fetch this device's Expo push token. Returns null
 * (never throws) when push isn't available: web, simulator/Expo Go, permission
 * denied, no EAS projectId, or any error. Logs a clear dev note in each case.
 */
export async function getExpoPushToken(): Promise<string | null> {
  if (!supported) return null;
  try {
    const N = notifications();
    if (!N) {
      console.log("[push] expo-notifications unavailable (Expo Go without dev build?) — skipping");
      return null;
    }

    // Android needs a notification channel for heads-up display + sound.
    await ensureAndroidChannel();

    const settings = await N.getPermissionsAsync();
    let granted = settings.granted || settings.ios?.status === N.IosAuthorizationStatus.PROVISIONAL;
    if (!granted) {
      const req = await N.requestPermissionsAsync();
      granted = req.granted || req.ios?.status === N.IosAuthorizationStatus.PROVISIONAL;
    }
    if (!granted) {
      console.log("[push] notification permission denied — skipping registration");
      return null;
    }

    const pid = projectId();
    const result = await N.getExpoPushTokenAsync(pid ? { projectId: pid } : undefined);
    return result.data ?? null;
  } catch (err) {
    // The common case on a simulator / Expo Go: no APNs/FCM credentials, so the
    // token request throws. That's expected — log once, no crash.
    console.log(
      "[push] could not get Expo push token (needs an EAS dev build on a physical device):",
      errMessage(err),
    );
    return null;
  }
}

/**
 * Full register-on-sign-in flow: get the token and POST it to the backend so
 * order-status pushes can reach THIS device. Fully best-effort — any failure is
 * logged and swallowed. Call after auth succeeds and on session restore.
 */
export async function registerForPushNotifications(): Promise<void> {
  if (!supported) return;
  setupNotifications();
  try {
    const token = await getExpoPushToken();
    if (!token) return; // nothing to register (sim / Expo Go / denied)
    const platform = Platform.OS === "android" ? "android" : "ios";
    await api.registerDevice(token, platform);
    console.log("[push] device registered for order-status notifications");
  } catch (err) {
    console.log("[push] device registration failed (non-fatal):", errMessage(err));
  }
}

/**
 * Register THIS device as the STAFF / store tablet so it receives new-order
 * alerts instead of customer status pushes. The owner runs this once on the
 * tablet (see the store-tablet note in the app/docs). Best-effort, never throws.
 */
export async function registerAsStaffDevice(): Promise<boolean> {
  if (!supported) return false;
  setupNotifications();
  try {
    const token = await getExpoPushToken();
    if (!token) return false;
    const platform = Platform.OS === "android" ? "android" : "ios";
    await api.registerDevice(token, platform, true);
    console.log("[push] THIS device is now the staff tablet for new-order alerts");
    return true;
  } catch (err) {
    console.log("[push] staff registration failed:", errMessage(err));
    return false;
  }
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
