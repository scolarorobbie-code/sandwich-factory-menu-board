import type { CartLineItem, Favorite, Menu, Order } from "@sf/contract";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { api } from "../api/client";
import * as haptics from "../haptics";
import { planReorder } from "../reorder";
import { useAuth } from "../state/auth";
import { useCart } from "../state/cart";
import { colors } from "../theme";
import { Skeleton } from "./Skeleton";

/**
 * "Your usual" — a one-tap quick-start row at the TOP of the Menu for SIGNED-IN
 * customers. Surfaces the #1/#2 retention features (saved favorites + reorder
 * your last order) where customers actually land, instead of burying them in
 * the Account tab.
 *
 * Behavior:
 *  - Signed-out: renders nothing.
 *  - Signed-in, no favorites AND no orders: renders nothing (no clutter for new
 *    users).
 *  - Otherwise: a horizontal row of favorite pills (tap → add to cart) and, if
 *    there's order history, a "Reorder your last order" button.
 *
 * Adds resolve against TODAY's menu via the shared reorder/cart helpers (Square
 * stays source of truth), exactly mirroring AccountScreen. All network calls
 * are best-effort: a failure just hides the section, never blocks the menu.
 *
 * MenuScreen owns the live `menu` (already loaded) and passes it in, plus an
 * `onAdded` callback so a successful add can route to the cart. Pull-to-refresh
 * re-fetches this section via the imperative `refresh()` handle.
 */

export interface QuickStartHandle {
  /** Re-fetch favorites + order history. Best-effort; safe to call anytime. */
  refresh: () => void;
}

interface Props {
  /** The live menu from MenuScreen, used to resolve adds. Null while loading. */
  menu: Menu | null;
  /** Called after a successful add so the parent can navigate to the cart. */
  onAdded: () => void;
}

export const QuickStart = forwardRef<QuickStartHandle, Props>(function QuickStart(
  { menu, onAdded },
  ref,
) {
  const { customer } = useAuth();
  const cart = useCart();
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  // Distinct from "empty": we don't want to flash an empty state before the
  // first fetch resolves, so we gate rendering on having loaded at least once.
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(() => {
    if (!customer) {
      setFavorites([]);
      setOrders([]);
      setLoaded(true);
      return;
    }
    // Best-effort, independent: one failing call must not hide the other.
    api.favorites().then(setFavorites).catch(() => {});
    api
      .orderHistory()
      .then((p) => setOrders(p.items))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [customer]);

  useEffect(() => {
    setLoaded(false);
    load();
  }, [load]);

  useImperativeHandle(ref, () => ({ refresh: load }), [load]);

  // Shared add path — mirrors AccountScreen.addAndGoToCart.
  const addAndGoToCart = useCallback(
    (lineItems: CartLineItem[], skipped: number, emptyMessage: string) => {
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
      onAdded();
    },
    [menu, cart, onAdded],
  );

  const addFavorite = useCallback(
    (fav: Favorite) => {
      haptics.tapMedium();
      addAndGoToCart(fav.lineItems, 0, `"${fav.name}" isn't available right now.`);
    },
    [addAndGoToCart],
  );

  const reorderLast = useCallback(() => {
    if (!menu) {
      Alert.alert("One moment", "Still loading the menu — try again in a second.");
      return;
    }
    const last = orders[0];
    if (!last) return;
    haptics.tapMedium();
    const plan = planReorder(menu, last);
    addAndGoToCart(
      plan.lineItems,
      plan.skipped,
      "None of the items from your last order are available right now.",
    );
  }, [menu, orders, addAndGoToCart]);

  // Signed-out: render nothing.
  if (!customer) return null;

  // First load in flight: slim skeleton so the menu never waits on us.
  if (!loaded) {
    return (
      <View style={styles.wrap}>
        <Skeleton style={{ width: 110, height: 16, borderRadius: 6, marginBottom: 12 }} />
        <View style={styles.row}>
          <Skeleton style={styles.pillSkeleton} />
          <Skeleton style={styles.pillSkeleton} />
        </View>
      </View>
    );
  }

  const hasFavorites = favorites.length > 0;
  const hasOrders = orders.length > 0;
  // Empty for this user: render nothing (no clutter for brand-new customers).
  if (!hasFavorites && !hasOrders) return null;

  const favCount = (f: Favorite) => f.lineItems.reduce((s, l) => s + l.quantity, 0);

  return (
    <View style={styles.wrap}>
      <Text style={styles.heading} accessibilityRole="header">
        Your usual
      </Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        keyboardShouldPersistTaps="handled"
      >
        {hasOrders ? (
          <Pressable
            style={[styles.pill, styles.reorderPill]}
            onPress={reorderLast}
            accessibilityRole="button"
            accessibilityLabel="Reorder your last order"
            accessibilityHint="Adds the items from your most recent order to your cart"
          >
            <Text style={styles.reorderText} numberOfLines={1}>
              ↻ Reorder last order
            </Text>
          </Pressable>
        ) : null}

        {favorites.map((f) => (
          <Pressable
            key={f.id}
            style={styles.pill}
            onPress={() => addFavorite(f)}
            accessibilityRole="button"
            accessibilityLabel={`Add ${f.name} to cart`}
            accessibilityHint="Adds this saved favorite to your cart"
          >
            <Text style={styles.favName} numberOfLines={1}>
              ⭐ {f.name}
            </Text>
            <Text style={styles.favMeta} numberOfLines={1}>
              {favCount(f)} item{favCount(f) === 1 ? "" : "s"} · Add
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    paddingTop: 14,
    paddingBottom: 4,
    paddingHorizontal: 16,
  },
  heading: {
    color: colors.accent2,
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  row: { flexDirection: "row", alignItems: "stretch", gap: 10, paddingRight: 16 },

  pill: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 44,
    maxWidth: 220,
    justifyContent: "center",
  },
  reorderPill: {
    backgroundColor: colors.accent2,
    borderColor: colors.accent2,
    alignItems: "center",
  },
  reorderText: { color: "#1a1410", fontSize: 15, fontWeight: "800" },

  favName: { color: colors.text, fontSize: 15, fontWeight: "800" },
  favMeta: { color: colors.muted, fontSize: 12, fontWeight: "600", marginTop: 3 },

  pillSkeleton: { width: 150, height: 48, borderRadius: 16 },
});
