import type { Menu, MenuItem, Money } from "@sf/contract";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { api } from "../api/client";

const money = (m: Money) => `$${(m.amount / 100).toFixed(2)}`;

function priceLabel(item: MenuItem): string {
  const prices = item.variations.map((v) => v.price.amount);
  const min = Math.min(...prices);
  const hasRange = prices.some((p) => p !== min);
  return `${money({ amount: min, currency: "USD" })}${hasRange ? "+" : ""}`;
}

export default function MenuScreen() {
  const [menu, setMenu] = useState<Menu | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      setError(null);
      setMenu(await api.menu());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load menu");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#ff5b35" />
        <Text style={styles.muted}>Loading menu…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>Couldn't load the menu</Text>
        <Text style={styles.muted}>{error}</Text>
        <Text style={styles.hint}>Is the backend running? (npm run backend:dev)</Text>
      </View>
    );
  }

  // Phase 0 goal: render one (the first) category end-to-end from the backend.
  const category = menu?.categories[0];

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.brand}>SANDWICH FACTORY</Text>
        <Text style={styles.muted}>{category?.name ?? "Menu"}</Text>
      </View>
      <FlatList
        data={category?.items ?? []}
        keyExtractor={(i) => i.id}
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor="#ff5b35" />}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.name}</Text>
              {item.description ? <Text style={styles.desc}>{item.description}</Text> : null}
              {!item.available ? <Text style={styles.soldout}>Sold out today</Text> : null}
            </View>
            <Text style={styles.price}>{priceLabel(item)}</Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0a0a0c" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#0a0a0c", padding: 24 },
  header: { paddingTop: 64, paddingHorizontal: 20, paddingBottom: 12 },
  brand: { color: "#ffb238", fontSize: 22, fontWeight: "800", letterSpacing: 2 },
  list: { padding: 16, gap: 12 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1c1815",
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  name: { color: "#f4f1ee", fontSize: 18, fontWeight: "700" },
  desc: { color: "#b8b2ac", fontSize: 14, marginTop: 4 },
  soldout: { color: "#ff5b35", fontSize: 13, marginTop: 6, fontWeight: "600" },
  price: { color: "#ffb238", fontSize: 18, fontWeight: "800", marginLeft: 12 },
  muted: { color: "#b8b2ac", fontSize: 15, marginTop: 8 },
  error: { color: "#ff5b35", fontSize: 18, fontWeight: "700" },
  hint: { color: "#7fd6e0", fontSize: 13, marginTop: 16, textAlign: "center" },
});
