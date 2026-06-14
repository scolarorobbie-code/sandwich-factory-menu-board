import type { Deal } from "@sf/contract";
import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from "react-native";
import { api } from "../api/client";
import { colors } from "../theme";

export default function DealsScreen() {
  const [deals, setDeals] = useState<Deal[] | null>(null);

  useEffect(() => {
    api.deals().then(setDeals).catch(() => setDeals([]));
  }, []);

  if (!deals) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <FlatList
        data={deals}
        keyExtractor={(d) => d.id}
        contentContainerStyle={{ padding: 16 }}
        ListHeaderComponent={<Text style={styles.title}>App-exclusive deals 🔥</Text>}
        ListEmptyComponent={<Text style={styles.muted}>No deals right now — check back soon!</Text>}
        renderItem={({ item }) => (
          <View style={styles.card}>
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
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  title: { color: colors.text, fontSize: 24, fontWeight: "800", marginBottom: 16 },
  muted: { color: colors.muted, fontSize: 15 },
  card: { backgroundColor: colors.card, borderRadius: 16, padding: 18, marginBottom: 12, borderWidth: 1, borderColor: colors.line },
  badge: { color: colors.accent, fontSize: 12, fontWeight: "800", letterSpacing: 1, marginBottom: 8 },
  dealTitle: { color: colors.text, fontSize: 19, fontWeight: "800" },
  desc: { color: colors.muted, fontSize: 15, marginTop: 6, lineHeight: 21 },
  code: { color: colors.accent2, fontSize: 14, fontWeight: "700", marginTop: 10 },
});
