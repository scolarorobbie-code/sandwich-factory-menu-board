import type { MenuItem } from "@sf/contract";

export type RootStackParamList = {
  Tabs: undefined;
  ItemDetail: { item: MenuItem };
  Cart: undefined;
  Auth: { next?: "Checkout" } | undefined;
  Checkout: undefined;
  OrderStatus: { orderId: string };
};

export type TabParamList = {
  Menu: undefined;
  Deals: undefined;
  Account: undefined;
};
