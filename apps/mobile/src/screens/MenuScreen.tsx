import type { Menu, MenuItem } from "@sf/contract";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useNavigation } from "@react-navigation/native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { api } from "../api/client";
import { MenuSkeleton } from "../components/Skeleton";
import * as haptics from "../haptics";
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
  const [refreshing, setRefreshing] = useState(false);
  // Live-typed search box value, plus a debounced copy that actually filters.
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");

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

  // Pull-to-refresh: re-fetch the menu, keep showing the current one meanwhile.
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const fresh = await api.menu();
      setMenu(fresh);
      setError(null);
      haptics.tapLight();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load menu");
    } finally {
      setRefreshing(false);
    }
  }, []);

  // Debounce the search input so typing stays smooth on a 129-item menu.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim().toLowerCase()), 140);
    return () => clearTimeout(t);
  }, [query]);

  const sections: Section[] = useMemo(
    () => menu?.categories.map((c, i) => ({ title: c.name, index: i, data: c.items })) ?? [],
    [menu],
  );

  const searching = debounced.length > 0;

  // Flat, de-duped results across every category when a query is active.
  const results: MenuItem[] = useMemo(() => {
    if (!menu || !searching) return [];
    const seen = new Set<string>();
    const out: MenuItem[] = [];
    for (const c of menu.categories) {
      for (const item of c.items) {
        if (seen.has(item.id)) continue;
        const hay = `${item.name} ${item.description ?? ""}`.toLowerCase();
        if (hay.includes(debounced)) {
          seen.add(item.id);
          out.push(item);
        }
      }
    }
    return out;
  }, [menu, searching, debounced]);

  function clearSearch() {
    setQuery("");
    setDebounced("");
    haptics.tapLight();
  }

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

  const renderCard = useCallback(
    (item: MenuItem) => (
      <Pressable
        style={[styles.card, !item.available && { opacity: 0.5 }]}
        onPress={() => item.available && nav.navigate("ItemDetail", { item })}
        accessibilityRole="button"
        accessibilityLabel={`${item.name}, ${item.available ? priceLabel(item) : "sold out"}`}
        accessibilityHint={item.available ? "Opens item to customize and add to cart" : undefined}
        accessibilityState={{ disabled: !item.available }}
      >
        {item.imageUrl ? (
          <Image source={{ uri: item.imageUrl }} style={styles.thumb} accessibilityIgnoresInvertColors />
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
    ),
    [nav],
  );

  if (error && !menu) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorEmoji}>📡</Text>
        <Text style={styles.error}>Couldn't load the menu</Text>
        <Text style={styles.muted}>{error}</Text>
        <Text style={styles.hint}>Is the backend running? (npm run backend:dev)</Text>
        <View style={{ height: 16 }} />
        <Pressable
          style={styles.retryBtn}
          onPress={load}
          accessibilityRole="button"
          accessibilityLabel="Retry loading the menu"
        >
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
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
      {/* Search */}
      <View style={styles.searchWrap}>
        <View style={styles.searchBox}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Search the menu"
            placeholderTextColor={colors.muted}
            returnKeyType="search"
            autoCorrect={false}
            clearButtonMode="never"
            accessibilityLabel="Search the menu"
            accessibilityHint="Filters items by name or description as you type"
          />
          {query.length > 0 ? (
            <Pressable
              onPress={clearSearch}
              hitSlop={12}
              style={styles.clearBtn}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
            >
              <Text style={styles.clearText}>✕</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {searching ? (
        // Flat filtered results — replaces the sticky-category list while typing.
        <FlatList
          data={results}
          keyExtractor={(i) => i.id}
          contentContainerStyle={results.length === 0 ? styles.emptyFill : { paddingTop: 8, paddingBottom: 110 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          renderItem={({ item }) => renderCard(item)}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>🤔</Text>
              <Text style={styles.emptyTitle}>No matches</Text>
              <Text style={styles.muted}>Nothing matches "{query.trim()}". Try another word.</Text>
            </View>
          }
        />
      ) : (
        <>
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
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active === item.index }}
                  accessibilityLabel={`${item.title} category`}
                  accessibilityHint="Jumps to this category"
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
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={colors.accent2}
                colors={[colors.accent2]}
              />
            }
            onScrollToIndexFailed={({ index }) => {
              setTimeout(() => {
                listRef.current?.scrollToLocation({ sectionIndex: index, itemIndex: 0, viewOffset: 8, animated: true });
              }, 250);
            }}
            renderSectionHeader={({ section }) => (
              <Text style={styles.section} accessibilityRole="header">
                {section.title}
              </Text>
            )}
            renderItem={({ item }) => renderCard(item)}
          />
        </>
      )}

      {cart.count > 0 && (
        <Pressable
          style={styles.cartBar}
          onPress={() => nav.navigate("Cart")}
          accessibilityRole="button"
          accessibilityLabel={`View cart, ${cart.count} item${cart.count === 1 ? "" : "s"}, $${(cart.subtotal / 100).toFixed(2)}`}
        >
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

  searchWrap: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6, backgroundColor: colors.bg2 },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 12,
    minHeight: 44,
  },
  searchIcon: { fontSize: 15, marginRight: 8 },
  searchInput: { flex: 1, color: colors.text, fontSize: 16, paddingVertical: 0 },
  clearBtn: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  clearText: { color: colors.muted, fontSize: 16, fontWeight: "800" },

  pillBar: { paddingVertical: 10, backgroundColor: colors.bg2, borderBottomWidth: 1, borderBottomColor: colors.line },
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    maxWidth: 200,
    minHeight: 44,
    justifyContent: "center",
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
  error: { color: colors.accent, fontSize: 18, fontWeight: "700", marginTop: 12 },
  errorEmoji: { fontSize: 40 },
  hint: { color: colors.cyan, fontSize: 13, marginTop: 16, textAlign: "center" },
  retryBtn: {
    backgroundColor: colors.accent2,
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
    minHeight: 44,
    justifyContent: "center",
  },
  retryText: { color: "#1a1410", fontSize: 15, fontWeight: "800" },

  emptyFill: { flexGrow: 1, justifyContent: "center" },
  empty: { alignItems: "center", paddingHorizontal: 24, gap: 4 },
  emptyEmoji: { fontSize: 40, marginBottom: 4 },
  emptyTitle: { color: colors.text, fontSize: 18, fontWeight: "800" },

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
