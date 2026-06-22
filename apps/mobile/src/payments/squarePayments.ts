/**
 * Crash-proof wrapper around Square's In-App Payments SDK (the native card
 * tokenizer). Mirrors src/haptics.ts and src/push.ts: the native module is
 * required LAZILY and every call is guarded, so a missing module (Expo Go, web,
 * simulator) can never crash the app or block checkout.
 *
 * ⚠️ KEY CONSTRAINT (see CLAUDE.md): the Square In-App Payments React Native
 * plugin (`react-native-square-in-app-payments`) wraps NATIVE iOS/Android
 * modules. It does NOT run in Expo Go or the managed workflow without native
 * code — it only works in an EAS dev/production build on a real device. So:
 *
 *   - On a REAL build (module present): we init the SDK with the PUBLIC Square
 *     application id, present Square's card-entry UI, and the card is tokenized
 *     ON-DEVICE. The app/backend never see raw card numbers (hard rule #2).
 *   - In Expo Go / web / sim (module ABSENT): every call no-ops and
 *     requestCardNonce() resolves the Square SANDBOX TEST NONCE so today's
 *     checkout flow is completely unchanged. The backend's mock + sandbox paths
 *     accept `cnon:card-nonce-ok` exactly as before.
 *
 * The SDK is intentionally NOT in package.json — it carries heavy native peer
 * deps that can't be built/verified in this environment. The owner installs it
 * during the EAS build session (see docs/EAS_AND_PAYMENTS.md). Until then this
 * file lazy-requires it and falls back, so nothing breaks.
 */
import { Platform } from "react-native";

/** Square's sandbox test nonce — always succeeds against sandbox/mock backends. */
export const SANDBOX_TEST_NONCE = "cnon:card-nonce-ok";

/** Shape returned to the checkout flow; mirrors what `api.pay` forwards. */
export interface CardNonceResult {
  /** Opaque single-use card token (Square "nonce" / sourceId). */
  nonce: string;
  /** SCA / buyer-verification token, when produced (live mode). */
  verificationToken?: string;
}

/** Native card entry only exists on real mobile builds. */
const supported = Platform.OS === "ios" || Platform.OS === "android";

// The Square plugin is an optional native module. Resolve it lazily and cache
// the result (including "absent") so a missing module can't crash module load.
// Typed loosely on purpose: the package isn't installed here, so there are no
// types to import. The real shape is exercised on the EAS build.
interface SquareCore {
  setSquareApplicationId(applicationId: string): Promise<void>;
}
interface CardDetails {
  nonce: string;
  card?: { brand?: string; lastFourDigits?: string };
}
interface BuyerVerificationDetails extends CardDetails {
  token?: string;
}
interface SquareCardEntry {
  startCardEntryFlow(
    config: unknown,
    onCardNonceRequestSuccess: (cardDetails: CardDetails) => void,
    onCardEntryCancel: () => void,
  ): Promise<void>;
  startCardEntryFlowWithBuyerVerification(
    config: unknown,
    onBuyerVerificationSuccess: (details: BuyerVerificationDetails) => void,
    onBuyerVerificationFailure: (error: unknown) => void,
    onCardEntryCancel: () => void,
  ): Promise<void>;
  completeCardEntry(onCardEntryComplete: () => void): Promise<void>;
}
interface SquareModule {
  SQIPCore: SquareCore;
  SQIPCardEntry: SquareCardEntry;
}

let mod: SquareModule | null | undefined;
function square(): SquareModule | null {
  if (mod === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      mod = require("react-native-square-in-app-payments") as SquareModule;
    } catch {
      // Expected in Expo Go / web / sim where the native module isn't bundled.
      mod = null;
    }
  }
  return mod ?? null;
}

/** Read the PUBLIC Square application id from app config (expo.extra). */
function squareApplicationId(): string | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Constants = require("expo-constants") as typeof import("expo-constants");
    const c =
      Constants.default ?? (Constants as unknown as (typeof import("expo-constants"))["default"]);
    const extra = c?.expoConfig?.extra as { squareApplicationId?: string } | undefined;
    return extra?.squareApplicationId;
  } catch {
    return undefined;
  }
}

let initialized = false;

/**
 * Initialize the Square SDK with the PUBLIC application id. Call ONCE at app
 * start. No-op (and never throws) on web / Expo Go / when the module or app id
 * is absent — the sandbox fallback in requestCardNonce() covers those.
 */
export async function initSquarePayments(): Promise<void> {
  if (!supported || initialized) return;
  try {
    const sq = square();
    const appId = squareApplicationId();
    if (!sq || !appId) {
      console.log(
        "[pay] Square In-App Payments SDK unavailable (Expo Go / no app id) — using sandbox test nonce",
      );
      return;
    }
    await sq.SQIPCore.setSquareApplicationId(appId);
    initialized = true;
    console.log("[pay] Square In-App Payments SDK initialized");
  } catch (err) {
    console.log("[pay] Square SDK init skipped (non-fatal):", errMessage(err));
  }
}

/**
 * True only when the native card-entry module is actually present (a real EAS
 * build). Lets the UI decide whether to show "real card" vs the sandbox note.
 */
export function isNativeCardEntryAvailable(): boolean {
  return supported && square() !== null;
}

/**
 * Get a single-use card token to charge the order with.
 *
 * On a REAL build: presents Square's native card-entry UI, tokenizes the card
 * ON-DEVICE (with buyer verification / SCA when available), and resolves the
 * nonce + verification token. Raw card data never reaches JS or the backend.
 *
 * In Expo Go / web / sim / when the module is absent: resolves the SANDBOX TEST
 * NONCE so checkout works unchanged for development and demos.
 *
 * Rejects only on a real, user-meaningful failure (card-entry error). A user
 * cancel rejects with CardEntryCancelled, which the caller treats as "aborted,
 * not an error".
 */
export async function requestCardNonce(): Promise<CardNonceResult> {
  if (!isNativeCardEntryAvailable()) {
    // Fallback path — identical to today's behavior.
    return { nonce: SANDBOX_TEST_NONCE };
  }

  const sq = square();
  if (!sq) return { nonce: SANDBOX_TEST_NONCE };

  return new Promise<CardNonceResult>((resolve, reject) => {
    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };

    // After a successful tokenization the native card form is STILL OPEN and
    // waiting; completeCardEntry() closes it, and only then do we resolve.
    const close = (result: CardNonceResult) => {
      void sq.SQIPCardEntry.completeCardEntry(() => {
        settle(() => resolve(result));
      }).catch(() => settle(() => resolve(result)));
    };

    try {
      const onCancel = () => settle(() => reject(new CardEntryCancelled()));

      // Prefer buyer verification (SCA) so we also collect a verification token,
      // which the backend forwards to Square. Fall back to the plain flow if the
      // verification variant isn't present on this SDK version.
      if (typeof sq.SQIPCardEntry.startCardEntryFlowWithBuyerVerification === "function") {
        void sq.SQIPCardEntry.startCardEntryFlowWithBuyerVerification(
          null,
          (details: BuyerVerificationDetails) =>
            close({ nonce: details.nonce, verificationToken: details.token }),
          (err: unknown) =>
            settle(() => reject(new Error(errMessage(err) || "Card verification failed"))),
          onCancel,
        ).catch((err) => settle(() => reject(asError(err))));
      } else {
        void sq.SQIPCardEntry.startCardEntryFlow(
          null,
          (card: CardDetails) => close({ nonce: card.nonce }),
          onCancel,
        ).catch((err) => settle(() => reject(asError(err))));
      }
    } catch (err) {
      settle(() => reject(asError(err)));
    }
  });
}

/** Thrown when the buyer dismisses the card form; callers treat it as a no-op. */
export class CardEntryCancelled extends Error {
  constructor() {
    super("Card entry cancelled");
    this.name = "CardEntryCancelled";
  }
}

function asError(err: unknown): Error {
  return err instanceof Error ? err : new Error(errMessage(err));
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
