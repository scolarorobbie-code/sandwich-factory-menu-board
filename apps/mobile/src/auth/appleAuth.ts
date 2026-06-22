/**
 * Crash-proof wrapper around expo-apple-authentication. Follows the same
 * lazy-require pattern as src/payments/squarePayments.ts and src/haptics.ts:
 * the native module is required lazily so a missing module (Expo Go, Android,
 * web) can never crash the app or block the sign-in screen.
 *
 *   - On a REAL EAS iOS build (module present + iOS 13+): shows Apple's native
 *     sign-in UI, exchanges the credential with our backend via POST /auth/apple.
 *   - In Expo Go / simulator / Android (module absent or isAvailableAsync false):
 *     isAppleAuthAvailable() returns false and the button is hidden entirely.
 *
 * expo-apple-authentication is intentionally NOT in package.json — it carries
 * native peer deps that can't be built here. Install it during the EAS build
 * session (see docs/EAS_AND_PAYMENTS.md). Until then this file lazy-requires it
 * and the fallback path kicks in, so nothing breaks.
 */
import { Platform } from "react-native";
import type { AppleAuthRequest } from "@sf/contract";

interface AppleScope {
  FULL_NAME: number;
  EMAIL: number;
}
interface AppleCredential {
  identityToken: string | null;
  authorizationCode: string | null;
  fullName: { givenName: string | null; familyName: string | null } | null;
}
interface AppleModule {
  isAvailableAsync(): Promise<boolean>;
  signInAsync(options: { requestedScopes: number[] }): Promise<AppleCredential>;
  AppleAuthenticationScope: AppleScope;
}

let mod: AppleModule | null | undefined;
function appleModule(): AppleModule | null {
  if (mod === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      mod = require("expo-apple-authentication") as AppleModule;
    } catch {
      mod = null;
    }
  }
  return mod ?? null;
}

/**
 * Returns true only when Apple Sign-In is actually available: the native module
 * is installed AND the device/OS supports it (iOS 13+, real device or supporting
 * simulator). Always false on Android, web, and Expo Go.
 */
export async function isAppleAuthAvailable(): Promise<boolean> {
  if (Platform.OS !== "ios") return false;
  const m = appleModule();
  if (!m) return false;
  try {
    return await m.isAvailableAsync();
  } catch {
    return false;
  }
}

/**
 * Launch Apple's native sign-in UI and return an AppleAuthRequest ready to
 * POST to the backend. Rejects with AppleSignInCancelled when the user dismisses.
 */
export async function requestAppleCredential(): Promise<AppleAuthRequest> {
  const m = appleModule();
  if (!m) throw new Error("expo-apple-authentication is not installed");

  const cred = await m.signInAsync({
    requestedScopes: [
      m.AppleAuthenticationScope.FULL_NAME,
      m.AppleAuthenticationScope.EMAIL,
    ],
  });

  if (!cred.identityToken || !cred.authorizationCode) {
    throw new Error("Apple Sign-In did not return required tokens");
  }

  return {
    identityToken: cred.identityToken,
    authorizationCode: cred.authorizationCode,
    firstName: cred.fullName?.givenName ?? undefined,
    lastName: cred.fullName?.familyName ?? undefined,
  };
}

/** Thrown when the user dismisses the Apple sign-in sheet. */
export class AppleSignInCancelled extends Error {
  constructor() {
    super("Apple Sign-In cancelled");
    this.name = "AppleSignInCancelled";
  }
}
