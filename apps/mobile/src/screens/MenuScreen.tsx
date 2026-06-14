import type { Menu, MenuItem } from "@sf/contract";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useNavigation } from "@react-navigation/native";
import { useEffect, useState } from "react";
import { ActivityIndicator, Image, Pressable, SectionList, StyleSheet, Text, View } from "react-native";
import { api } from "../api/client";
import { useCart } from "../state/cart";
import { colors } from "../theme";
import type { RootStackParamList } from "../navigation/types";

const minPrice = (item: MenuItem) => Math.min(...item.variations.map((v) => v.price.amount));
const priceLabel = (item: MenuItem) => {
  const min = minPrice(item);
  const range = item.variations.some((v) => v.price.amount !== min);
  return `$${(min / 100).toFixed(2)}${range ? "+" : ""}`;
};

export default function MenuScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const cart = useCart();
  const [menu, setMenu] = useState<Menu | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setError(null);
      setMenu(await api.menu());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load menu");
    }
  }
  useEffect(() => {
    load();
  }, []);

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>Couldn't load the menu</Text>
        <Text style={styles.muted}>{error}</Text>
        <Text style={styles.hint}>Is the backend running? (npm run backend:dev)</Text>
      </View>
    );
  }
  if (!menu) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  const sections = menu.categories.map((c) => ({ title: c.name, data: c.items }));

  return (
    <View style={styles.screen}>
      <SectionList
        sections={sections}
        keyExtractor={(i) => i.id}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ padding: 16, paddingBottom: 96 }}
        renderSectionHeader={({ section }) => <Text style={styles.section}>{section.title}</Text>}
        renderItem={({ item }) => (
          <Pressable
            style={[styles.card, !item.available && { opacity: 0.55 }]}
            onPress={() => item.available && nav.navigate("ItemDetail", { item })}
          >
            {item.imageUrl ? (
              <Image source={{ uri: item.imageUrl }} style={styles.thumb} />
            ) : (
              <View style={[styles.thumb, styles.thumbPlaceholder]}>
                <Text style={{ fontSize: 26 }}>🍽️</Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.name}</Text>
              {item.description ? (
                <Text style={styles.desc} numberOfLines={2}>
                  {item.description}
                </Text>
              ) : null}
              {!item.available ? <Text style={styles.soldout}>Sold out today</Text> : null}
            </View>
            <Text style={styles.price}>{priceLabel(item)}</Text>
          </Pressable>
        )}
      />
      {cart.count > 0 && (
        <Pressable style={styles.cartBar} onPress={() => nav.navigate("Cart")}>
          <Text style={styles.cartBarText}>
            View cart · {cart.count} item{cart.count === 1 ? "" : "s"}
          </Text>
          <Text style={styles.cartBarPrice}>${(cart.subtotal / 100).toFixed(2)}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg, padding: 24 },
  section: { color: colors.accent2, fontSize: 20, fontWeight: "800", marginTop: 18, marginBottom: 10, letterSpacing: 1 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.line,
  },
  thumb: { width: 64, height: 64, borderRadius: 12, marginRight: 14, backgroundColor: "#2a2421" },
  thumbPlaceholder: { alignItems: "center", justifyContent: "center" },
  name: { color: colors.text, fontSize: 18, fontWeight: "700" },
  desc: { color: colors.muted, fontSize: 14, marginTop: 4 },
  soldout: { color: colors.accent, fontSize: 13, marginTop: 6, fontWeight: "600" },
  price: { color: colors.accent2, fontSize: 18, fontWeight: "800", marginLeft: 12 },
  muted: { color: colors.muted, fontSize: 15, marginTop: 8, textAlign: "center" },
  error: { color: colors.accent, fontSize: 18, fontWeight: "700" },
  hint: { color: colors.cyan, fontSize: 13, marginTop: 16, textAlign: "center" },
  cartBar: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 16,
    backgroundColor: colors.accent,
    borderRadius: 16,
    padding: 18,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  cartBarText: { color: "#fff", fontSize: 16, fontWeight: "800" },
  cartBarPrice: { color: "#fff", fontSize: 16, fontWeight: "800" },
});
