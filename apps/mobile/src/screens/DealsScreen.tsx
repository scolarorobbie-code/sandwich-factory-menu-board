import type { Deal } from "@sf/contract";
import { useEffect, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { api } from "../api/client";
import { Skeleton } from "../components/Skeleton";
import { colors } from "../theme";

export default function DealsScreen() {
  const [deals, setDeals] = useState<Deal[] | null>(null);

  useEffect(() => {
    api.deals().then(setDeals).catch(() => setDeals([]));
  }, []);

  if (!deals) {
    return (
      <View style={styles.screen}>
        <View style={{ padding: 16 }}>
          <Text style={styles.title}>App-exclusive deals 🔥</Text>
          {[0, 1, 2].map((i) => (
            <View key={i} style={styles.card}>
              <Skeleton style={{ width: "60%", height: 19, borderRadius: 6 }} />
              <Skeleton style={{ width: "90%", height: 14, borderRadius: 6, marginTop: 10 }} />
            </View>
          ))}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <FlatList
        data={deals}
        keyExtractor={(d) => d.id}
        contentContainerStyle={{ padding: 16 }}
        ListHeaderComponent={
          <Text style={styles.title} accessibilityRole="header">
            App-exclusive deals 🔥
          </Text>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>🥪</Text>
            <Text style={styles.emptyTitle}>No deals right now</Text>
            <Text style={styles.muted}>Check back soon — app-only offers drop here.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View
            style={styles.card}
            accessibilityLabel={`${item.appExclusive ? "App only deal. " : "Deal. "}${item.title}. ${item.description}${item.code ? `. Code ${item.code}` : ""}`}
          >
            {item.appExclusive ? <Text style={styles.badge}>APP ONLY</Text> : null}
            <Text style={styles.dealTitle}>{item.title}</Text>
            <Text style={styles.desc}>{item.description}</Text>
            {item.code ? <Text style={styles.code}>Code: {item.code}</Text> : null}
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  title: { color: colors.text, fontSize: 24, fontWeight: "800", marginBottom: 16 },
  muted: { color: colors.muted, fontSize: 15, textAlign: "center" },
  empty: { alignItems: "center", paddingTop: 48, paddingHorizontal: 24, gap: 6 },
  emptyEmoji: { fontSize: 40, marginBottom: 4 },
  emptyTitle: { color: colors.text, fontSize: 18, fontWeight: "700" },
  card: { backgroundColor: colors.card, borderRadius: 16, padding: 18, marginBottom: 12, borderWidth: 1, borderColor: colors.line },
  badge: { color: colors.accent, fontSize: 12, fontWeight: "800", letterSpacing: 1, marginBottom: 8 },
  dealTitle: { color: colors.text, fontSize: 19, fontWeight: "800" },
  desc: { color: colors.muted, fontSize: 15, marginTop: 6, lineHeight: 21 },
  code: { color: colors.accent2, fontSize: 14, fontWeight: "700", marginTop: 10 },
});
