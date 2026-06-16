import { useEffect, useRef } from "react";
import { Animated, StyleSheet, View, type ViewStyle } from "react-native";
import { colors } from "../theme";

/**
 * A single grey placeholder block with a gentle pulse. Used to build skeleton
 * screens that match the real layout so loads feel instant (premium cue).
 */
export function Skeleton({ style }: { style?: ViewStyle | ViewStyle[] }) {
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 650, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 650, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return <Animated.View style={[styles.block, style, { opacity }]} />;
}

/** Mirrors a MenuScreen item card (thumb + name + desc + price lines). */
export function MenuCardSkeleton() {
  return (
    <View style={styles.card}>
      <Skeleton style={styles.thumb} />
      <View style={styles.body}>
        <Skeleton style={{ width: "70%", height: 18, borderRadius: 6 }} />
        <Skeleton style={{ width: "90%", height: 13, borderRadius: 6, marginTop: 8 }} />
        <Skeleton style={{ width: "40%", height: 16, borderRadius: 6, marginTop: 10 }} />
      </View>
    </View>
  );
}

/** A full Menu loading state: a faux category header + several cards. */
export function MenuSkeleton() {
  return (
    <View style={{ paddingTop: 16 }}>
      <Skeleton style={{ width: 160, height: 22, borderRadius: 6, marginHorizontal: 16, marginBottom: 14 }} />
      {Array.from({ length: 6 }).map((_, i) => (
        <MenuCardSkeleton key={i} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { backgroundColor: "#2a2421" },
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
  thumb: { width: 92, height: 92, borderRadius: 14 },
  body: { flex: 1, marginLeft: 14 },
});
