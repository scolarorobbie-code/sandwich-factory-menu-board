/**
 * App configuration. The backend base URL comes from the environment so the
 * same binary points at sandbox or production without code changes.
 *
 * For the iOS simulator, localhost works. On a physical device, set this to
 * your machine's LAN IP (e.g. http://192.168.1.20:8787) or the deployed Worker.
 */
export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:8787";
