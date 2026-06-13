import type { Deal, Menu } from "@sf/contract";
import { isLive, type Env } from "./env";
import { MOCK_MENU } from "./mocks/menu";
import { fetchLiveMenu } from "./square";

/** The menu, from live Square Catalog when credentials are present, else mock. */
export async function getMenu(env: Env): Promise<Menu> {
  return isLive(env) ? fetchLiveMenu(env) : MOCK_MENU;
}

/**
 * App-exclusive deals. Mock for now; production reads these from a config store
 * (KV/D1) the owner edits. `code` deals apply a discount at checkout.
 */
export function getDeals(): Deal[] {
  const now = Date.now();
  const week = 7 * 24 * 60 * 60 * 1000;
  return [
    {
      id: "deal-double-stars",
      title: "Double Stars this week",
      description: "Earn 2 Stars per $1 on every app order through Sunday.",
      code: "DOUBLESTARS",
      startsAt: new Date(now - week).toISOString(),
      endsAt: new Date(now + week).toISOString(),
      appExclusive: true,
    },
    {
      id: "deal-free-cookie",
      title: "Free cookie over $15",
      description: "Spend $15 in the app and we'll add a fresh-baked cookie on us.",
      code: "FREECOOKIE",
      startsAt: new Date(now - week).toISOString(),
      endsAt: new Date(now + week).toISOString(),
      appExclusive: true,
    },
  ];
}
