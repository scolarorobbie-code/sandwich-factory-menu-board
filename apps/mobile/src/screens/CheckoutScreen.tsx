import type { Deal, Loyalty, LoyaltyReward, Order } from "@sf/contract";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { api } from "../api/client";
import { Button } from "../components/Button";
import * as haptics from "../haptics";
import {
  CardEntryCancelled,
  isNativeCardEntryAvailable,
  requestCardNonce,
} from "../payments/squarePayments";
import { useCart } from "../state/cart";
import { colors, money } from "../theme";
import type { RootStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "Checkout">;

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

export default function CheckoutScreen({ navigation, route }: Props) {
  const cart = useCart();
  const [order, setOrder] = useState<Order | null>(null);
  const [loyalty, setLoyalty] = useState<Loyalty | null>(null);
  const [redeem, setRedeem] = useState(false);
  // App-exclusive deals the customer can apply at checkout, + the chosen one.
  const [deals, setDeals] = useState<Deal[]>([]);
  const [dealId, setDealId] = useState<string | undefined>(route.params?.dealId);
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  // Disables the toggle/deal controls while we re-create the order.
  const [recalculating, setRecalculating] = useState(false);

  const reward = bestAffordableReward(loyalty);
  const selectedDeal = deals.find((d) => d.id === dealId);

  // Create (or re-create) the order. `useStars` decides whether we send the
  // affordable reward's cost as `redeemStars`; `applyDealId` is the chosen deal
  // (or undefined). Square (live) or the mock path then returns the authoritative
  // discount/total we render, so the summary always reflects what's actually applied.
  async function buildOrder(useStars: boolean, applyDealId: string | undefined) {
    const redeemStars = useStars && reward ? reward.cost : undefined;
    const res = await api.createOrder({ lineItems: cart.toLineItems(), redeemStars, dealId: applyDealId });
    setOrder(res.order);
  }

  useEffect(() => {
    const initialDealId = route.params?.dealId;
    (async () => {
      try {
        await buildOrder(false, initialDealId);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't start checkout");
      }
    })();
    // Loyalty is best-effort — a failure just hides the redeem control.
    api.loyalty().then(setLoyalty).catch(() => {});
    // Deals are best-effort — a failure just hides the deal picker.
    api.deals().then(setDeals).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function toggleRedeem(next: boolean) {
    setRedeem(next);
    setRecalculating(true);
    setError(null);
    try {
      await buildOrder(next, dealId);
    } catch (e) {
      // Roll the toggle back so the UI never claims a discount Square rejected.
      setRedeem(!next);
      setError(e instanceof Error ? e.message : "Couldn't apply your Stars");
    } finally {
      setRecalculating(false);
    }
  }

  // Apply (or clear, when `next === undefined`) a deal and re-price the order.
  // Reversible: tapping the selected deal again clears it. The backend ignores
  // ineligible deals (e.g. subtotal below the minimum) — we surface that with a
  // hint rather than blocking, so the choice is always obvious + safe.
  async function applyDeal(next: string | undefined) {
    const prev = dealId;
    setDealId(next);
    setRecalculating(true);
    setError(null);
    try {
      await buildOrder(redeem, next);
      haptics.tapLight();
    } catch (e) {
      setDealId(prev);
      haptics.warning();
      setError(e instanceof Error ? e.message : "Couldn't apply that deal");
    } finally {
      setRecalculating(false);
    }
  }

  async function pay() {
    if (!order) return;
    setPaying(true);
    setError(null);
    try {
      // On a real EAS build this presents Square's native card-entry UI and
      // tokenizes the card ON-DEVICE; in Expo Go / sim it resolves the sandbox
      // test nonce so the flow is unchanged. The backend code path is identical.
      const { nonce, verificationToken } = await requestCardNonce();
      const res = await api.pay(order.id, nonce, verificationToken);
      haptics.success();
      cart.clear();
      // receiptUrl is only present in LIVE mode (Square returns it on payment);
      // pass it straight through so the status screen can offer "View receipt".
      navigation.replace("OrderStatus", { orderId: res.order.id, receiptUrl: res.receiptUrl });
    } catch (e) {
      // The buyer dismissing the card form is not an error — just stop spinning.
      if (e instanceof CardEntryCancelled) {
        setPaying(false);
        return;
      }
      haptics.warning();
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
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
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
          {order.discount.amount > 0 && (
            <Row label={selectedDeal ? selectedDeal.title : "Discount"} value={`−${money(order.discount)}`} />
          )}
          <Row label="Tax" value={money(order.tax)} />
          <Row label="Total" value={money(order.total)} bold />
          {order.starsEarned ? (
            <Text style={styles.stars}>You'll earn ⭐ {order.starsEarned} Stars</Text>
          ) : null}
        </View>

        {deals.length > 0 ? (
          <View style={styles.dealsBlock}>
            <Text style={styles.dealsHeader} accessibilityRole="header">
              App-exclusive deals
            </Text>
            {deals.map((d) => {
              const active = d.id === dealId;
              // When a discount deal is applied but the order came back with no
              // discount, the eligibility floor (e.g. min subtotal) wasn't met.
              const noDiscountApplied = active && order.discount.amount === 0;
              return (
                <Pressable
                  key={d.id}
                  style={[styles.dealCard, active && styles.dealCardActive]}
                  onPress={() => !recalculating && applyDeal(active ? undefined : d.id)}
                  disabled={recalculating}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`${active ? "Applied. " : ""}${d.title}. ${d.description}`}
                  accessibilityHint={active ? "Tap to remove this deal" : "Tap to apply this deal"}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.dealTitle}>{d.title}</Text>
                    <Text style={styles.dealDesc}>{d.description}</Text>
                    {noDiscountApplied ? (
                      <Text style={styles.dealHint}>Add a little more to qualify for this deal.</Text>
                    ) : null}
                  </View>
                  <View style={[styles.dealCheck, active && styles.dealCheckOn]}>
                    <Text style={styles.dealCheckText}>{active ? "✓" : "+"}</Text>
                  </View>
                </Pressable>
              );
            })}
            {selectedDeal ? (
              <Pressable
                onPress={() => !recalculating && applyDeal(undefined)}
                disabled={recalculating}
                accessibilityRole="button"
                accessibilityLabel="Remove applied deal"
              >
                <Text style={styles.dealRemove}>Remove deal</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

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
      </ScrollView>

      <View style={styles.footer}>
        <Text style={styles.testNote}>
          {isNativeCardEntryAvailable()
            ? "💳 Enter your card on the next screen — secured by Square"
            : "💳 Sandbox test card — no real charge"}
        </Text>
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

  dealsBlock: { marginTop: 20 },
  dealsHeader: { color: colors.accent2, fontSize: 15, fontWeight: "800", letterSpacing: 0.3, marginBottom: 10 },
  dealCard: { flexDirection: "row", alignItems: "center", backgroundColor: colors.card, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: colors.line },
  dealCardActive: { borderColor: colors.accent2, borderWidth: 2 },
  dealTitle: { color: colors.text, fontSize: 15, fontWeight: "800" },
  dealDesc: { color: colors.muted, fontSize: 13, marginTop: 3, lineHeight: 18 },
  dealHint: { color: colors.accent, fontSize: 12, marginTop: 6, fontWeight: "600" },
  dealCheck: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.line, marginLeft: 12 },
  dealCheckOn: { backgroundColor: colors.accent2, borderColor: colors.accent2 },
  dealCheckText: { color: colors.text, fontSize: 16, fontWeight: "800" },
  dealRemove: { color: colors.accent, fontSize: 13, fontWeight: "700", textAlign: "center", marginTop: 2, marginBottom: 4 },

  error: { color: colors.accent, fontSize: 14, marginTop: 16, textAlign: "center" },
  footer: { padding: 16, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.bg2 },
  testNote: { color: colors.muted, fontSize: 12, textAlign: "center" },
});
