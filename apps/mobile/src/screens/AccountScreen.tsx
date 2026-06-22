import type { CartLineItem, Favorite, Loyalty, Menu, Order } from "@sf/contract";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { api } from "../api/client";
import { Button } from "../components/Button";
import * as haptics from "../haptics";
import { registerAsStaffDevice } from "../push";
import { planReorder } from "../reorder";
import { useAuth } from "../state/auth";
import { useCart } from "../state/cart";
import { colors, money } from "../theme";
import type { RootStackParamList } from "../navigation/types";

export default function AccountScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { customer, signOut } = useAuth();
  const cart = useCart();
  const [loyalty, setLoyalty] = useState<Loyalty | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [menu, setMenu] = useState<Menu | null>(null);
  // Order id currently being re-added, for inline disabled feedback.
  const [busy, setBusy] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!customer) return;
      api.loyalty().then(setLoyalty).catch(() => {});
      api.orderHistory().then((p) => setOrders(p.items)).catch(() => {});
      api.favorites().then(setFavorites).catch(() => {});
      // Menu is needed to resolve reorders/favorites against today's catalog.
      api.menu().then(setMenu).catch(() => {});
    }, [customer]),
  );

  // Add resolved line items to the cart, warn about anything no longer available,
  // then route to the cart. Shared by Reorder and favorites.
  function addAndGoToCart(lineItems: CartLineItem[], skipped: number, emptyMessage: string) {
    if (!menu) {
      Alert.alert("One moment", "Still loading the menu — try again in a second.");
      return;
    }
    const res = cart.addLineItems(menu, lineItems);
    if (res.added === 0) {
      haptics.warning();
      Alert.alert("Unavailable", emptyMessage);
      return;
    }
    haptics.success();
    const dropped = skipped + res.skipped;
    if (dropped > 0) {
      Alert.alert(
        "Added to cart",
        `${res.added} item${res.added === 1 ? "" : "s"} added. ${dropped} item${dropped === 1 ? "" : "s"} couldn't be re-added (no longer on the menu).`,
      );
    }
    nav.navigate("Cart");
  }

  function reorder(order: Order) {
    if (!menu) {
      Alert.alert("One moment", "Still loading the menu — try again in a second.");
      return;
    }
    haptics.tapMedium();
    setBusy(order.id);
    const plan = planReorder(menu, order);
    setBusy(null);
    addAndGoToCart(
      plan.lineItems,
      plan.skipped,
      "None of the items from this order are available right now.",
    );
  }

  function addFavorite(fav: Favorite) {
    haptics.tapMedium();
    addAndGoToCart(fav.lineItems, 0, `"${fav.name}" isn't available right now.`);
  }

  function removeFavorite(fav: Favorite) {
    Alert.alert("Remove favorite", `Remove "${fav.name}" from your favorites?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          // Optimistic removal; restore on failure.
          setFavorites((prev) => prev.filter((f) => f.id !== fav.id));
          try {
            await api.deleteFavorite(fav.id);
            haptics.tapLight();
          } catch {
            setFavorites((prev) => [...prev, fav]);
            haptics.warning();
            Alert.alert("Couldn't remove", "Please try again.");
          }
        },
      },
    ]);
  }

  if (!customer) {
    return (
      <View style={styles.signedOut}>
        <Text style={styles.title}>Your account</Text>
        <Text style={styles.muted}>Sign in to track orders, earn Stars, and reorder your favorites.</Text>
        <View style={{ height: 20 }} />
        <Button title="Sign In or Create Account" onPress={() => nav.navigate("Auth")} />
      </View>
    );
  }

  const favCount = (f: Favorite) => f.lineItems.reduce((s, l) => s + l.quantity, 0);

  // Owner-only: long-press the greeting to turn THIS device into the store
  // tablet that receives new-order alerts. Hidden from normal customers; the
  // step is documented for the owner. No-op on simulator / Expo Go.
  function makeStaffTablet() {
    Alert.alert(
      "Use this device as the store tablet?",
      "This iPad/phone will receive an alert every time a customer places an order. Use the dedicated kitchen device.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Make it the tablet",
          onPress: async () => {
            const ok = await registerAsStaffDevice();
            haptics[ok ? "success" : "warning"]();
            Alert.alert(
              ok ? "Done" : "Not registered",
              ok
                ? "This device will now buzz for every new order."
                : "Couldn't register (needs a real build on a physical device with notifications allowed).",
            );
          },
        },
      ],
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: 20 }}>
      <View style={styles.headerRow}>
        <Text style={styles.hello} onLongPress={makeStaffTablet}>
          Hi, {customer.firstName} 👋
        </Text>
        <Pressable
          style={styles.settingsBtn}
          onPress={() => nav.navigate("Settings")}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Settings"
          accessibilityHint="Notifications and profile"
        >
          <Text style={styles.settingsIcon}>⚙︎</Text>
          <Text style={styles.settingsText}>Settings</Text>
        </Pressable>
      </View>

      <View
        style={styles.starCard}
        accessibilityLabel={`${loyalty?.stars ?? 0} Stars${loyalty?.rewards?.length ? `. Next reward: ${loyalty.rewards[0].name} at ${loyalty.rewards[0].cost} Stars` : ""}`}
      >
        <Text style={styles.starCount}>⭐ {loyalty?.stars ?? 0}</Text>
        <Text style={styles.starLabel}>Stars</Text>
        <Text style={styles.earnRule}>{loyalty?.earnRule ?? "1 Star per $1 spent"}</Text>
        {loyalty?.rewards?.length ? (
          <>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${Math.min(100, Math.round(((loyalty.stars) / loyalty.rewards[0].cost) * 100))}%` },
                ]}
              />
            </View>
            <Text style={styles.reward}>
              {loyalty.stars >= loyalty.rewards[0].cost
                ? `🎉 You can redeem: ${loyalty.rewards[0].name}!`
                : `${loyalty.stars} / ${loyalty.rewards[0].cost} Stars → ${loyalty.rewards[0].name}`}
            </Text>
          </>
        ) : null}
      </View>

      <Text style={styles.section} accessibilityRole="header">
        Your favorites
      </Text>
      {favorites.length === 0 ? (
        <View style={styles.emptyBlock}>
          <Text style={styles.emptyEmoji}>⭐</Text>
          <Text style={styles.emptyTitle}>No favorites yet</Text>
          <Text style={styles.muted}>Save your usual from any item to reorder it in one tap.</Text>
        </View>
      ) : (
        favorites.map((f) => (
          <View key={f.id} style={styles.favorite}>
            <View style={{ flex: 1 }}>
              <Text style={styles.favName}>{f.name}</Text>
              <Text style={styles.muted}>
                {favCount(f)} item{favCount(f) === 1 ? "" : "s"}
              </Text>
              <Pressable
                onPress={() => removeFavorite(f)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${f.name} from favorites`}
              >
                <Text style={styles.remove}>Remove</Text>
              </Pressable>
            </View>
            <Pressable
              style={styles.addBtn}
              onPress={() => addFavorite(f)}
              accessibilityRole="button"
              accessibilityLabel={`Add ${f.name} to cart`}
              accessibilityHint="Adds this saved order to your cart"
            >
              <Text style={styles.addBtnText}>Add to cart</Text>
            </Pressable>
          </View>
        ))
      )}

      <Text style={styles.section} accessibilityRole="header">
        Order history
      </Text>
      {orders.length === 0 ? (
        <View style={styles.emptyBlock}>
          <Text style={styles.emptyEmoji}>🧾</Text>
          <Text style={styles.emptyTitle}>No orders yet</Text>
          <Text style={styles.muted}>Your past orders show up here for one-tap reordering.</Text>
        </View>
      ) : (
        orders.map((o) => (
          <View key={o.id} style={styles.order}>
            <Pressable
              style={styles.orderTop}
              onPress={() => nav.navigate("OrderStatus", { orderId: o.id })}
              accessibilityRole="button"
              accessibilityLabel={`Order ${o.displayNumber}, ${o.status.toLowerCase()}, ${money(o.total)}`}
              accessibilityHint="Opens order status"
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.orderNum}>Order #{o.displayNumber}</Text>
                <Text style={styles.muted} numberOfLines={1}>
                  {o.lineItems.map((l) => `${l.quantity}× ${l.name}`).join(", ")}
                </Text>
                <Text style={styles.muted}>
                  {o.status} · {new Date(o.createdAt).toLocaleDateString()}
                </Text>
              </View>
              <Text style={styles.orderTotal}>{money(o.total)}</Text>
            </Pressable>
            <Pressable
              style={[styles.reorderBtn, busy === o.id && { opacity: 0.6 }]}
              onPress={() => reorder(o)}
              disabled={busy === o.id}
              accessibilityRole="button"
              accessibilityLabel={`Reorder order ${o.displayNumber}`}
              accessibilityHint="Adds these items to your cart"
            >
              <Text style={styles.reorderText}>↻ Reorder</Text>
            </Pressable>
          </View>
        ))
      )}

      <View style={{ height: 28 }} />
      <Button title="Sign out" variant="secondary" onPress={signOut} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  signedOut: { flex: 1, backgroundColor: colors.bg, padding: 24, justifyContent: "center" },
  title: { color: colors.text, fontSize: 24, fontWeight: "800" },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  hello: { color: colors.text, fontSize: 26, fontWeight: "800", flex: 1 },
  settingsBtn: { flexDirection: "row", alignItems: "center", paddingVertical: 6, paddingHorizontal: 10, marginLeft: 10 },
  settingsIcon: { color: colors.accent2, fontSize: 18, marginRight: 5 },
  settingsText: { color: colors.accent2, fontSize: 15, fontWeight: "700" },
  muted: { color: colors.muted, fontSize: 15, marginTop: 8, lineHeight: 21 },
  starCard: { backgroundColor: colors.card, borderRadius: 18, padding: 22, marginTop: 20, borderWidth: 1, borderColor: colors.line, alignItems: "center" },
  starCount: { color: colors.accent2, fontSize: 44, fontWeight: "900" },
  starLabel: { color: colors.text, fontSize: 16, fontWeight: "700", letterSpacing: 2 },
  earnRule: { color: colors.muted, fontSize: 14, marginTop: 8 },
  progressTrack: { width: "100%", height: 8, backgroundColor: colors.line, borderRadius: 999, marginTop: 14, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: colors.accent2, borderRadius: 999 },
  reward: { color: colors.accent2, fontSize: 14, marginTop: 8, fontWeight: "600" },
  section: { color: colors.accent2, fontSize: 20, fontWeight: "800", marginTop: 28, marginBottom: 12 },
  emptyBlock: { alignItems: "center", paddingVertical: 16, gap: 4 },
  emptyEmoji: { fontSize: 34, marginBottom: 2 },
  emptyTitle: { color: colors.text, fontSize: 16, fontWeight: "800" },

  favorite: { flexDirection: "row", alignItems: "center", backgroundColor: colors.card, borderRadius: 14, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: colors.line },
  favName: { color: colors.text, fontSize: 16, fontWeight: "800" },
  addBtn: { backgroundColor: colors.accent2, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10, marginLeft: 12 },
  addBtnText: { color: "#1a1410", fontSize: 14, fontWeight: "800" },
  remove: { color: colors.accent, fontSize: 13, marginTop: 8, fontWeight: "600" },

  order: { backgroundColor: colors.card, borderRadius: 14, marginBottom: 10, borderWidth: 1, borderColor: colors.line, overflow: "hidden" },
  orderTop: { flexDirection: "row", alignItems: "center", padding: 16 },
  orderNum: { color: colors.text, fontSize: 16, fontWeight: "700" },
  orderTotal: { color: colors.accent2, fontSize: 16, fontWeight: "800", marginLeft: 12 },
  reorderBtn: { borderTopWidth: 1, borderTopColor: colors.line, paddingVertical: 12, alignItems: "center", backgroundColor: colors.bg2 },
  reorderText: { color: colors.accent2, fontSize: 15, fontWeight: "800" },
});
