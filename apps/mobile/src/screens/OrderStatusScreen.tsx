import type { Order, OrderStatus } from "@sf/contract";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { api } from "../api/client";
import { Button } from "../components/Button";
import { colors } from "../theme";
import type { RootStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "OrderStatus">;

const STEPS: { status: OrderStatus; label: string; emoji: string }[] = [
  { status: "RECEIVED", label: "Order received", emoji: "✅" },
  { status: "MAKING", label: "Making it", emoji: "👨‍🍳" },
  { status: "READY", label: "Ready for pickup", emoji: "🥪" },
];
const ORDER: OrderStatus[] = ["DRAFT", "RECEIVED", "MAKING", "READY", "COMPLETED"];

export default function OrderStatusScreen({ route }: Props) {
  const { orderId } = route.params;
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
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  const currentIdx = ORDER.indexOf(order.status);

  return (
    <View style={styles.screen}>
      <Text style={styles.number}>Order #{order.displayNumber}</Text>
      <Text style={styles.muted}>Pickup · 116 Chaffin Pl, Murfreesboro</Text>

      <View style={styles.steps}>
        {STEPS.map((step) => {
          const idx = ORDER.indexOf(step.status);
          const done = currentIdx >= idx;
          return (
            <View key={step.status} style={styles.step}>
              <View style={[styles.dot, done && styles.dotOn]}>
                <Text style={styles.dotEmoji}>{done ? step.emoji : "•"}</Text>
              </View>
              <Text style={[styles.stepLabel, done && styles.stepLabelOn]}>{step.label}</Text>
            </View>
          );
        })}
      </View>

      {order.status === "READY" && <Text style={styles.ready}>🎉 Come grab it at the counter!</Text>}
      {order.status === "COMPLETED" && <Text style={styles.ready}>Thanks for stopping by!</Text>}

      <View style={{ flex: 1 }} />

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
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, padding: 20 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  number: { color: colors.text, fontSize: 28, fontWeight: "800", marginTop: 12 },
  muted: { color: colors.muted, fontSize: 14, marginTop: 4 },
  steps: { marginTop: 36, gap: 22 },
  step: { flexDirection: "row", alignItems: "center", gap: 16 },
  dot: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.card, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.line },
  dotOn: { backgroundColor: colors.accent2, borderColor: colors.accent2 },
  dotEmoji: { fontSize: 20 },
  stepLabel: { color: colors.muted, fontSize: 18 },
  stepLabelOn: { color: colors.text, fontWeight: "700" },
  ready: { color: colors.accent2, fontSize: 18, fontWeight: "800", marginTop: 28 },
  footer: { borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 16 },
  devNote: { color: colors.muted, fontSize: 12, lineHeight: 18 },
});
