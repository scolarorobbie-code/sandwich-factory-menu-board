import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { Button } from "../components/Button";
import { entryTotal, useCart } from "../state/cart";
import { useAuth } from "../state/auth";
import { colors, dollars } from "../theme";
import type { RootStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "Cart">;

export default function CartScreen({ navigation }: Props) {
  const cart = useCart();
  const { customer } = useAuth();

  if (cart.entries.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.empty}>Your cart is empty</Text>
        <Text style={styles.muted}>Add something tasty from the menu.</Text>
      </View>
    );
  }

  function checkout() {
    if (!customer) navigation.navigate("Auth", { next: "Checkout" });
    else navigation.navigate("Checkout");
  }

  return (
    <View style={styles.screen}>
      <FlatList
        data={cart.entries}
        keyExtractor={(e) => e.key}
        contentContainerStyle={{ padding: 16 }}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>
                {item.quantity}× {item.itemName}
              </Text>
              <Text style={styles.sub}>{item.variation.name}</Text>
              {item.modifiers.length > 0 && (
                <Text style={styles.sub}>{item.modifiers.map((m) => m.name).join(", ")}</Text>
              )}
              {item.note ? <Text style={styles.note}>"{item.note}"</Text> : null}
              <Pressable onPress={() => cart.remove(item.key)}>
                <Text style={styles.remove}>Remove</Text>
              </Pressable>
            </View>
            <Text style={styles.price}>{dollars(entryTotal(item))}</Text>
          </View>
        )}
      />
      <View style={styles.footer}>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Subtotal</Text>
          <Text style={styles.totalValue}>{dollars(cart.subtotal)}</Text>
        </View>
        <Text style={styles.muted}>Tax calculated at checkout · Pickup only</Text>
        <View style={{ height: 12 }} />
        <Button title="Go to checkout" onPress={checkout} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  empty: { color: colors.text, fontSize: 20, fontWeight: "800" },
  muted: { color: colors.muted, fontSize: 14, marginTop: 6 },
  card: { flexDirection: "row", backgroundColor: colors.card, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: colors.line },
  name: { color: colors.text, fontSize: 17, fontWeight: "700" },
  sub: { color: colors.muted, fontSize: 14, marginTop: 2 },
  note: { color: colors.cyan, fontSize: 13, marginTop: 4, fontStyle: "italic" },
  remove: { color: colors.accent, fontSize: 14, marginTop: 8, fontWeight: "600" },
  price: { color: colors.accent2, fontSize: 17, fontWeight: "800", marginLeft: 12 },
  footer: { padding: 16, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.bg2 },
  totalRow: { flexDirection: "row", justifyContent: "space-between" },
  totalLabel: { color: colors.text, fontSize: 18, fontWeight: "800" },
  totalValue: { color: colors.text, fontSize: 18, fontWeight: "800" },
});
