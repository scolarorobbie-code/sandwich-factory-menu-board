import type { Health, Menu } from "@sf/contract";
import { API_BASE_URL } from "../config";

/**
 * Typed API client. Every response type comes from the shared contract, so the
 * app and backend cannot drift. Add methods here as Phase 1 endpoints land.
 */
async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`);
  if (!res.ok) {
    let detail = "";
    try {
      detail = JSON.stringify(await res.json());
    } catch {
      /* ignore */
    }
    throw new Error(`GET ${path} failed (${res.status}) ${detail}`);
  }
  return (await res.json()) as T;
}

export const api = {
  health: () => get<Health>("/health"),
  menu: () => get<Menu>("/menu"),
};
