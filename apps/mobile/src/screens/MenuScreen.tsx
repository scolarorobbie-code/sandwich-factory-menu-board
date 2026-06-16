import type { Menu, MenuItem } from "@sf/contract";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useNavigation } from "@react-navigation/native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  Image,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { api } from "../api/client";
import { MenuSkeleton } from "../components/Skeleton";
import { useCart } from "../state/cart";
import { colors } from "../theme";
import type { RootStackParamList } from "../navigation/types";

interface Section {
  title: string;
  index: number;
  data: MenuItem[];
}

const minPrice = (item: MenuItem) => Math.min(...item.variations.map((v) => v.price.amount));
const priceLabel = (item: MenuItem) => {
  const min = minPrice(item);
  const range = item.variations.some((v) => v.price.amount !== min);
  return `$${(min / 100).toFixed(2)}${range ? "+" : ""}`;
};

export default function MenuScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const cart = useCart();
  const [menu, setMenu] = useState<Menu | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(0);

  const listRef = useRef<SectionList<MenuItem, Section>>(null);
  const pillRef = useRef<FlatList<Section>>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setMenu(await api.menu());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load menu");
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const sections: Section[] = useMemo(
    () => menu?.categories.map((c, i) => ({ title: c.name, index: i, data: c.items })) ?? [],
    [menu],
  );

  function jumpTo(index: number) {
    setActive(index);
    pillRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 });
    listRef.current?.scrollToLocation({ sectionIndex: index, itemIndex: 0, viewOffset: 8, animated: true });
  }

  // Keep the active pill in sync with what's on screen as you scroll.
  const onViewable = useRef(
    (info: { viewableItems: Array<{ section?: Section }> }) => {
      const sec = info.viewableItems.find((v) => v.section)?.section;
      if (sec) {
        setActive(sec.index);
        pillRef.current?.scrollToIndex({ index: sec.index, animated: true, viewPosition: 0.5 });
      }
    },
  ).current;
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 30 }).current;

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>Couldn't load the menu</Text>
        <Text style={styles.muted}>{error}</Text>
        <Text style={styles.hint}>Is the backend running? (npm run backend:dev)</Text>
      </View>
    );
  }
  if (!menu) {
    return (
      <View style={styles.screen}>
        <MenuSkeleton />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {/* Sticky category bar */}
      <View style={styles.pillBar}>
        <FlatList
          ref={pillRef}
          data={sections}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={(s) => String(s.index)}
          contentContainerStyle={{ paddingHorizontal: 12, gap: 8 }}
          onScrollToIndexFailed={() => {}}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => jumpTo(item.index)}
              style={[styles.pill, active === item.index && styles.pillActive]}
            >
              <Text style={[styles.pillText, active === item.index && styles.pillTextActive]} numberOfLines={1}>
                {item.title}
              </Text>
            </Pressable>
          )}
        />
      </View>

      <SectionList
        ref={listRef}
        sections={sections}
        keyExtractor={(i) => i.id}
        stickySectionHeadersEnabled
        contentContainerStyle={{ paddingBottom: 110 }}
        onViewableItemsChanged={onViewable}
        viewabilityConfig={viewabilityConfig}
        onScrollToIndexFailed={({ index }) => {
          setTimeout(() => {
            listRef.current?.scrollToLocation({ sectionIndex: index, itemIndex: 0, viewOffset: 8, animated: true });
          }, 250);
        }}
        renderSectionHeader={({ section }) => <Text style={styles.section}>{section.title}</Text>}
        renderItem={({ item }) => (
          <Pressable
            style={[styles.card, !item.available && { opacity: 0.5 }]}
            onPress={() => item.available && nav.navigate("ItemDetail", { item })}
          >
            {item.imageUrl ? (
              <Image source={{ uri: item.imageUrl }} style={styles.thumb} />
            ) : (
              <View style={[styles.thumb, styles.thumbPlaceholder]}>
                <Text style={{ fontSize: 30 }}>🥪</Text>
              </View>
            )}
            <View style={styles.cardBody}>
              <Text style={styles.name} numberOfLines={1}>
                {item.name}
              </Text>
              {item.description ? (
                <Text style={styles.desc} numberOfLines={2}>
                  {item.description}
                </Text>
              ) : null}
              <Text style={styles.price}>{item.available ? priceLabel(item) : "Sold out"}</Text>
            </View>
          </Pressable>
        )}
      />

      {cart.count > 0 && (
        <Pressable style={styles.cartBar} onPress={() => nav.navigate("Cart")}>
          <View style={styles.cartCount}>
            <Text style={styles.cartCountText}>{cart.count}</Text>
          </View>
          <Text style={styles.cartBarText}>View cart</Text>
          <Text style={styles.cartBarPrice}>${(cart.subtotal / 100).toFixed(2)}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg, padding: 24 },

  pillBar: { paddingVertical: 10, backgroundColor: colors.bg2, borderBottomWidth: 1, borderBottomColor: colors.line },
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    maxWidth: 200,
  },
  pillActive: { backgroundColor: colors.accent2, borderColor: colors.accent2 },
  pillText: { color: colors.muted, fontSize: 14, fontWeight: "700" },
  pillTextActive: { color: "#1a1410" },

  section: {
    color: colors.accent2,
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: 0.5,
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 10,
    backgroundColor: colors.bg,
  },

  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: 18,
    padding: 12,
    marginHorizontal: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.line,
  },
  thumb: { width: 92, height: 92, borderRadius: 14, backgroundColor: "#2a2421" },
  thumbPlaceholder: { alignItems: "center", justifyContent: "center" },
  cardBody: { flex: 1, marginLeft: 14 },
  name: { color: colors.text, fontSize: 18, fontWeight: "800" },
  desc: { color: colors.muted, fontSize: 13, marginTop: 4, lineHeight: 18 },
  price: { color: colors.accent2, fontSize: 17, fontWeight: "800", marginTop: 8 },

  muted: { color: colors.muted, fontSize: 15, marginTop: 8, textAlign: "center" },
  error: { color: colors.accent, fontSize: 18, fontWeight: "700" },
  hint: { color: colors.cyan, fontSize: 13, marginTop: 16, textAlign: "center" },

  cartBar: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 16,
    backgroundColor: colors.accent,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
  },
  cartCount: {
    backgroundColor: "rgba(0,0,0,0.25)",
    borderRadius: 999,
    minWidth: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  cartCountText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  cartBarText: { color: "#fff", fontSize: 16, fontWeight: "800", marginLeft: 12, flex: 1 },
  cartBarPrice: { color: "#fff", fontSize: 16, fontWeight: "800" },
});
