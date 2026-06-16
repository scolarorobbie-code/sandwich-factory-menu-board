import type { Loyalty, LoyaltyReward, Order } from "@sf/contract";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, View } from "react-native";
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

/**
 * The best reward the customer can afford with their current balance: the
 * highest-cost tier whose `cost` is <= the balance. Returns null when nothing
 * is affordable (control is then hidden). Mirrors the backend's "pick the most
 * valuable affordable tier" logic so the preview matches what Square applies.
 */
function bestAffordableReward(loyalty: Loyalty | null): LoyaltyReward | null {
  if (!loyalty) return null;
  return (
    loyalty.rewards
      .filter((r) => r.cost > 0 && r.cost <= loyalty.stars)
      .sort((a, b) => b.cost - a.cost)[0] ?? null
  );
}

export default function CheckoutScreen({ navigation }: Props) {
  const cart = useCart();
  const [order, setOrder] = useState<Order | null>(null);
  const [loyalty, setLoyalty] = useState<Loyalty | null>(null);
  const [redeem, setRedeem] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  // Disables the toggle while we re-create the order with/without the discount.
  const [recalculating, setRecalculating] = useState(false);

  const reward = bestAffordableReward(loyalty);

  // Create (or re-create) the order. `useStars` decides whether we send the
  // affordable reward's cost as `redeemStars`. Square (live) or the mock 50=$5
  // path then returns the authoritative discount/total we render.
  async function buildOrder(useStars: boolean) {
    const redeemStars = useStars && reward ? reward.cost : undefined;
    const res = await api.createOrder({ lineItems: cart.toLineItems(), redeemStars });
    setOrder(res.order);
  }

  useEffect(() => {
    (async () => {
      try {
        await buildOrder(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't start checkout");
      }
    })();
    // Loyalty is best-effort — a failure just hides the redeem control.
    api.loyalty().then(setLoyalty).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function toggleRedeem(next: boolean) {
    setRedeem(next);
    setRecalculating(true);
    setError(null);
    try {
      await buildOrder(next);
    } catch (e) {
      // Roll the toggle back so the UI never claims a discount Square rejected.
      setRedeem(!next);
      setError(e instanceof Error ? e.message : "Couldn't apply your Stars");
    } finally {
      setRecalculating(false);
    }
  }

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

        {reward ? (
          <Pressable
            style={styles.redeemCard}
            onPress={() => !recalculating && toggleRedeem(!redeem)}
            disabled={recalculating}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.redeemTitle}>⭐ Use {reward.cost} Stars</Text>
              <Text style={styles.redeemSub}>
                {redeem ? `Saving ${money(reward.value)} — ${reward.name}` : `${reward.name} · you have ${loyalty?.stars ?? 0} Stars`}
              </Text>
            </View>
            {recalculating ? (
              <ActivityIndicator color={colors.accent2} />
            ) : (
              <Switch
                value={redeem}
                onValueChange={toggleRedeem}
                trackColor={{ true: colors.accent2, false: colors.line }}
                thumbColor={colors.text}
              />
            )}
          </Pressable>
        ) : loyalty && loyalty.stars > 0 ? (
          <Text style={styles.redeemHint}>
            ⭐ {loyalty.stars} Stars — earn{" "}
            {loyalty.rewards[0] ? `${loyalty.rewards[0].cost - loyalty.stars} more for ${loyalty.rewards[0].name}` : "more"} to redeem.
          </Text>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>

      <View style={styles.footer}>
        <Text style={styles.testNote}>💳 Sandbox test card — no real charge</Text>
        <View style={{ height: 8 }} />
        <Button title={`Pay ${money(order.total)}`} onPress={pay} loading={paying} disabled={recalculating} />
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
  redeemCard: { flexDirection: "row", alignItems: "center", backgroundColor: colors.card, borderRadius: 16, padding: 16, marginTop: 16, borderWidth: 1, borderColor: colors.accent2 },
  redeemTitle: { color: colors.text, fontSize: 16, fontWeight: "800" },
  redeemSub: { color: colors.muted, fontSize: 13, marginTop: 3 },
  redeemHint: { color: colors.muted, fontSize: 13, marginTop: 16, textAlign: "center" },
  error: { color: colors.accent, fontSize: 14, marginTop: 16, textAlign: "center" },
  footer: { padding: 16, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.bg2 },
  testNote: { color: colors.muted, fontSize: 12, textAlign: "center" },
});
