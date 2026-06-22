/**
 * Thin, crash-proof wrapper around expo-haptics.
 *
 * Haptics are an optional premium flourish — they must NEVER break the app. The
 * native module is absent in Expo Go for some platforms and on web, so every
 * call is wrapped in try/catch and the module is required lazily. If anything
 * is missing the calls are silent no-ops.
 */
import { Platform } from "react-native";

// Lazily resolved so a missing/native-less module can't crash module load.
type Haptics = typeof import("expo-haptics");
let mod: Haptics | null | undefined;
function haptics(): Haptics | null {
  if (mod === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      mod = require("expo-haptics") as Haptics;
    } catch {
      mod = null;
    }
  }
  return mod ?? null;
}

// Haptics only exist on mobile; skip on web entirely.
const supported = Platform.OS === "ios" || Platform.OS === "android";

/** Light tap — selection toggles, add-to-cart. */
export function tapLight() {
  if (!supported) return;
  try {
    const h = haptics();
    h?.impactAsync(h.ImpactFeedbackStyle.Light);
  } catch {
    /* no-op */
  }
}

/** Medium tap — primary button presses. */
export function tapMedium() {
  if (!supported) return;
  try {
    const h = haptics();
    h?.impactAsync(h.ImpactFeedbackStyle.Medium);
  } catch {
    /* no-op */
  }
}

/** Selection tick — choosing a modifier / size. */
export function selection() {
  if (!supported) return;
  try {
    haptics()?.selectionAsync();
  } catch {
    /* no-op */
  }
}

/** Success buzz — order placed, favorite saved. */
export function success() {
  if (!supported) return;
  try {
    const h = haptics();
    h?.notificationAsync(h.NotificationFeedbackType.Success);
  } catch {
    /* no-op */
  }
}

/** Warning buzz — validation error. */
export function warning() {
  if (!supported) return;
  try {
    const h = haptics();
    h?.notificationAsync(h.NotificationFeedbackType.Warning);
  } catch {
    /* no-op */
  }
}
