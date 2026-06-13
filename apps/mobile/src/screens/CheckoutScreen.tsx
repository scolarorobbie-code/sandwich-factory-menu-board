import type { Order } from "@sf/contract";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { api } from "../api/client";
import { Button } from "../components/Button";
import { useCart } from "../state/cart";
import { colors, money } from "../theme";
import type { RootStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "Checkout">;

// In Expo Go we can't run the native Square In-App Payments SDK, so we use
// Square's sandbox test nonce. On the EAS build this is replaced by the real
// card token the SDK produces on-device (the backend code path is identical).
const TEST_CARD_NONCE = "cnon:card-nonce-ok";

export default function CheckoutScreen({ navigation }: Props) {
  const cart = useCart();
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.createOrder({ lineItems: cart.toLineItems() });
        setOrder(res.order);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't start checkout");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function pay() {
    if (!order) return;
    setPaying(true);
    setError(null);
    try {
      const res = await api.pay(order.id, TEST_CARD_NONCE);
      cart.clear();
      navigation.replace("OrderStatus", { orderId: res.order.id });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Payment failed");
      setPaying(false);
    }
  }

  if (error && !order) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }
  if (!order) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={{ flex: 1, padding: 20 }}>
        <Text style={styles.heading}>Pickup order</Text>
        <Text style={styles.muted}>116 Chaffin Pl, Murfreesboro, TN</Text>

        <View style={styles.summary}>
          {order.lineItems.map((l, i) => (
            <View key={i} style={styles.line}>
              <Text style={styles.lineName}>
                {l.quantity}× {l.name}
              </Text>
              <Text style={styles.linePrice}>{money(l.total)}</Text>
            </View>
          ))}
          <View style={styles.divider} />
          <Row label="Subtotal" value={money(order.subtotal)} />
          {order.discount.amount > 0 && <Row label="Discount" value={`−${money(order.discount)}`} />}
          <Row label="Tax" value={money(order.tax)} />
          <Row label="Total" value={money(order.total)} bold />
          {order.starsEarned ? (
            <Text style={styles.stars}>You'll earn ⭐ {order.starsEarned} Stars</Text>
          ) : null}
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>

      <View style={styles.footer}>
        <Text style={styles.testNote}>💳 Sandbox test card — no real charge</Text>
        <View style={{ height: 8 }} />
        <Button title={`Pay ${money(order.total)}`} onPress={pay} loading={paying} />
      </View>
    </View>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={styles.line}>
      <Text style={[styles.rowLabel, bold && styles.bold]}>{label}</Text>
      <Text style={[styles.rowLabel, bold && styles.bold]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg, padding: 24 },
  heading: { color: colors.text, fontSize: 24, fontWeight: "800" },
  muted: { color: colors.muted, fontSize: 14, marginTop: 4 },
  summary: { backgroundColor: colors.card, borderRadius: 16, padding: 18, marginTop: 24, borderWidth: 1, borderColor: colors.line },
  line: { flexDirection: "row", justifyContent: "space-between", marginVertical: 4 },
  lineName: { color: colors.text, fontSize: 15, flex: 1 },
  linePrice: { color: colors.text, fontSize: 15 },
  divider: { height: 1, backgroundColor: colors.line, marginVertical: 12 },
  rowLabel: { color: colors.muted, fontSize: 15 },
  bold: { color: colors.text, fontSize: 18, fontWeight: "800" },
  stars: { color: colors.accent2, fontSize: 14, fontWeight: "700", marginTop: 12 },
  error: { color: colors.accent, fontSize: 14, marginTop: 16, textAlign: "center" },
  footer: { padding: 16, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.bg2 },
  testNote: { color: colors.muted, fontSize: 12, textAlign: "center" },
});
