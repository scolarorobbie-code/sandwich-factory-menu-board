import type { Order, OrderStatus } from "@sf/contract";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useEffect, useRef, useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { api } from "../api/client";
import { Button } from "../components/Button";
import { Skeleton } from "../components/Skeleton";
import { colors } from "../theme";
import type { RootStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "OrderStatus">;

const STEPS: { status: OrderStatus; label: string; emoji: string }[] = [
  { status: "RECEIVED", label: "Order received", emoji: "✅" },
  { status: "MAKING", label: "Making it", emoji: "👨‍🍳" },
  { status: "READY", label: "Ready for pickup", emoji: "🥪" },
];
const ORDER: OrderStatus[] = ["DRAFT", "RECEIVED", "MAKING", "READY", "COMPLETED"];

/**
 * ETA copy derived from the order. The Order contract carries an OPTIONAL
 * `pickup.readyEta` (ISO timestamp, fed by the backend's prep-time → Square
 * `pickup_at`). When present we show a friendly clock time + minutes-away.
 * When it's absent (or the order is already done) we fall back to warm static
 * reassurance — NO contract fields are added.
 */
function etaCopy(order: Order): string | null {
  if (order.status === "READY" || order.status === "COMPLETED" || order.status === "CANCELED") return null;
  const iso = order.pickup?.readyEta;
  if (!iso) {
    return order.status === "MAKING"
      ? "We're on it — your order is being made fresh."
      : "We've got your order — we'll start it right away.";
  }
  const ready = new Date(iso).getTime();
  if (Number.isNaN(ready)) return "We've got your order — hang tight.";
  const mins = Math.round((ready - Date.now()) / 60000);
  const clock = new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (mins <= 1) return "Almost ready — any minute now.";
  return `Ready in ~${mins} min · about ${clock}`;
}

export default function OrderStatusScreen({ route }: Props) {
  const { orderId, receiptUrl } = route.params;
  const [order, setOrder] = useState<Order | null>(null);
  const [advancing, setAdvancing] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  async function refresh() {
    try {
      setOrder(await api.getOrder(orderId));
    } catch {
      /* keep last known */
    }
  }

  useEffect(() => {
    refresh();
    // Poll as a fallback; push notifications are the primary status channel.
    timer.current = setInterval(refresh, 5000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  async function simulateStaff() {
    setAdvancing(true);
    try {
      setOrder(await api.advanceOrder(orderId));
    } finally {
      setAdvancing(false);
    }
  }

  if (!order) {
    return (
      <View style={styles.screen}>
        <Skeleton style={{ width: 180, height: 30, borderRadius: 8, marginTop: 12 }} />
        <Skeleton style={{ width: 240, height: 14, borderRadius: 6, marginTop: 12 }} />
        <View style={{ marginTop: 36, gap: 22 }}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={styles.step}>
              <Skeleton style={{ width: 44, height: 44, borderRadius: 22 }} />
              <Skeleton style={{ width: 160, height: 18, borderRadius: 6, marginTop: 12 }} />
            </View>
          ))}
        </View>
      </View>
    );
  }

  const currentIdx = ORDER.indexOf(order.status);
  const eta = etaCopy(order);

  return (
    <View style={styles.screen}>
      <Text style={styles.number} accessibilityRole="header">
        Order #{order.displayNumber}
      </Text>
      <Text style={styles.muted}>Pickup · 116 Chaffin Pl, Murfreesboro</Text>

      {eta ? (
        <View style={styles.etaCard} accessibilityLabel={`Estimated pickup. ${eta}`}>
          <Text style={styles.etaLabel}>Estimated pickup</Text>
          <Text style={styles.etaValue}>{eta}</Text>
        </View>
      ) : null}

      <View
        style={styles.steps}
        accessibilityRole="progressbar"
        accessibilityLabel={`Order status: ${STEPS.find((s) => s.status === order.status)?.label ?? order.status}`}
      >
        {STEPS.map((step, i) => {
          const idx = ORDER.indexOf(step.status);
          const done = currentIdx >= idx;
          const current = order.status === step.status;
          // The connector below this step lights up once the NEXT step is reached.
          const nextReached = i < STEPS.length - 1 && currentIdx >= ORDER.indexOf(STEPS[i + 1].status);
          return (
            <View key={step.status} style={styles.step}>
              <View style={styles.dotCol}>
                <View style={[styles.dot, done && styles.dotOn, current && styles.dotCurrent]}>
                  <Text style={styles.dotEmoji}>{done ? step.emoji : "•"}</Text>
                </View>
                {i < STEPS.length - 1 ? <View style={[styles.connector, nextReached && styles.connectorOn]} /> : null}
              </View>
              <View style={styles.stepTextCol}>
                <Text style={[styles.stepLabel, done && styles.stepLabelOn, current && styles.stepLabelCurrent]}>
                  {step.label}
                </Text>
                {current ? <Text style={styles.stepNow}>In progress</Text> : null}
              </View>
            </View>
          );
        })}
      </View>

      {order.status === "READY" && <Text style={styles.ready}>🎉 Come grab it at the counter!</Text>}
      {order.status === "COMPLETED" && <Text style={styles.ready}>Thanks for stopping by!</Text>}

      {receiptUrl ? (
        <Pressable
          style={styles.receiptBtn}
          onPress={() => Linking.openURL(receiptUrl).catch(() => {})}
          accessibilityRole="link"
          accessibilityLabel="View receipt"
          accessibilityHint="Opens your Square receipt in the browser"
        >
          <Text style={styles.receiptText}>🧾 View receipt</Text>
        </Pressable>
      ) : null}

      <View style={{ flex: 1 }} />

      {__DEV__ && (
        <View style={styles.footer}>
          <Text style={styles.devNote}>
            For testing: tap below to act as the kitchen and advance the status (normally Square POS does this).
          </Text>
          <View style={{ height: 8 }} />
          <Button
            title="Simulate staff updating the order"
            variant="secondary"
            onPress={simulateStaff}
            loading={advancing}
            disabled={order.status === "COMPLETED"}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, padding: 20 },
  number: { color: colors.text, fontSize: 28, fontWeight: "800", marginTop: 12 },
  muted: { color: colors.muted, fontSize: 14, marginTop: 4 },

  etaCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 16,
    marginTop: 20,
  },
  etaLabel: { color: colors.muted, fontSize: 13, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase" },
  etaValue: { color: colors.accent2, fontSize: 20, fontWeight: "800", marginTop: 6 },

  steps: { marginTop: 28 },
  step: { flexDirection: "row", alignItems: "flex-start", gap: 16 },
  dotCol: { alignItems: "center" },
  dot: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.line,
  },
  dotOn: { backgroundColor: colors.accent2, borderColor: colors.accent2 },
  dotCurrent: { borderWidth: 2, borderColor: colors.accent },
  dotEmoji: { fontSize: 20 },
  connector: { width: 2, height: 26, backgroundColor: colors.line, marginVertical: 2 },
  connectorOn: { backgroundColor: colors.accent2 },
  stepTextCol: { paddingTop: 10 },
  stepLabel: { color: colors.muted, fontSize: 18 },
  stepLabelOn: { color: colors.text, fontWeight: "700" },
  stepLabelCurrent: { color: colors.accent2 },
  stepNow: { color: colors.accent, fontSize: 13, fontWeight: "700", marginTop: 2 },

  ready: { color: colors.accent2, fontSize: 18, fontWeight: "800", marginTop: 28 },
  receiptBtn: { marginTop: 24, alignSelf: "flex-start", paddingVertical: 8 },
  receiptText: { color: colors.accent2, fontSize: 16, fontWeight: "700", textDecorationLine: "underline" },
  footer: { borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 16 },
  devNote: { color: colors.muted, fontSize: 12, lineHeight: 18 },
});
