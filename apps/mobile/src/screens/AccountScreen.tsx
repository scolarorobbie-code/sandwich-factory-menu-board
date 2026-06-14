import type { Loyalty, Order } from "@sf/contract";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { api } from "../api/client";
import { Button } from "../components/Button";
import { useAuth } from "../state/auth";
import { colors, money } from "../theme";
import type { RootStackParamList } from "../navigation/types";

export default function AccountScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { customer, signOut } = useAuth();
  const [loyalty, setLoyalty] = useState<Loyalty | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);

  useFocusEffect(
    useCallback(() => {
      if (!customer) return;
      api.loyalty().then(setLoyalty).catch(() => {});
      api.orderHistory().then((p) => setOrders(p.items)).catch(() => {});
    }, [customer]),
  );

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

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: 20 }}>
      <Text style={styles.hello}>Hi, {customer.firstName} 👋</Text>

      <View style={styles.starCard}>
        <Text style={styles.starCount}>⭐ {loyalty?.stars ?? 0}</Text>
        <Text style={styles.starLabel}>Stars</Text>
        <Text style={styles.earnRule}>{loyalty?.earnRule ?? "1 Star per $1 spent"}</Text>
        {loyalty?.rewards?.length ? (
          <Text style={styles.reward}>
            Next reward: {loyalty.rewards[0].name} at {loyalty.rewards[0].cost} Stars
          </Text>
        ) : null}
      </View>

      <Text style={styles.section}>Order history</Text>
      {orders.length === 0 ? (
        <Text style={styles.muted}>No orders yet.</Text>
      ) : (
        orders.map((o) => (
          <Pressable key={o.id} style={styles.order} onPress={() => nav.navigate("OrderStatus", { orderId: o.id })}>
            <View style={{ flex: 1 }}>
              <Text style={styles.orderNum}>Order #{o.displayNumber}</Text>
              <Text style={styles.muted}>
                {o.status} · {new Date(o.createdAt).toLocaleDateString()}
              </Text>
            </View>
            <Text style={styles.orderTotal}>{money(o.total)}</Text>
          </Pressable>
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
  hello: { color: colors.text, fontSize: 26, fontWeight: "800" },
  muted: { color: colors.muted, fontSize: 15, marginTop: 8, lineHeight: 21 },
  starCard: { backgroundColor: colors.card, borderRadius: 18, padding: 22, marginTop: 20, borderWidth: 1, borderColor: colors.line, alignItems: "center" },
  starCount: { color: colors.accent2, fontSize: 44, fontWeight: "900" },
  starLabel: { color: colors.text, fontSize: 16, fontWeight: "700", letterSpacing: 2 },
  earnRule: { color: colors.muted, fontSize: 14, marginTop: 8 },
  reward: { color: colors.cyan, fontSize: 14, marginTop: 6 },
  section: { color: colors.accent2, fontSize: 20, fontWeight: "800", marginTop: 28, marginBottom: 12 },
  order: { flexDirection: "row", alignItems: "center", backgroundColor: colors.card, borderRadius: 14, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: colors.line },
  orderNum: { color: colors.text, fontSize: 16, fontWeight: "700" },
  orderTotal: { color: colors.accent2, fontSize: 16, fontWeight: "800" },
});
