import type { MenuItem } from "@sf/contract";

export type RootStackParamList = {
  Tabs: undefined;
  ItemDetail: { item: MenuItem };
  Cart: undefined;
  Auth: { next?: "Checkout" } | undefined;
  Checkout: undefined;
  /** receiptUrl: passed straight from the payment response (live mode only). */
  OrderStatus: { orderId: string; receiptUrl?: string };
  Settings: undefined;
};

export type TabParamList = {
  Menu: undefined;
  Deals: undefined;
  Account: undefined;
};
