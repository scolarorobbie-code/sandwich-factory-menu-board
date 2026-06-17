import { Image, StyleSheet, Text, View } from "react-native";
import { logo, name } from "../brand";
import { colors } from "../theme";

/**
 * Brandmark — the reusable brand header for Sandwich Factory.
 *
 * Today there is no logo file (the owner still owes us one — see
 * docs/BRANDING.md and docs/WEB_SOCIAL_AUDIT.md §4), so this renders a styled
 * TEXT WORDMARK: "SANDWICH FACTORY".
 *
 * IT IS BUILT FOR A TRIVIAL LOGO SWAP: once a real logo lands, set
 * `logo.image` + `logo.hasImage = true` in src/brand.ts and this component
 * automatically renders the <Image> instead — no edits here or in any screen.
 *
 * Used as the navigation header title (see navigation/RootNavigator.tsx).
 */
export function Brandmark({ height = 22 }: { height?: number }) {
  if (logo.hasImage && logo.image != null) {
    // Real logo path. `resizeMode="contain"` keeps the aspect ratio; width is
    // generous and the image is contained within it. Tune once the real asset
    // dimensions are known.
    return (
      <Image
        source={logo.image}
        accessibilityLabel={logo.accessibilityLabel}
        resizeMode="contain"
        style={{ height, width: height * 6 }}
      />
    );
  }

  // Placeholder text wordmark. "SANDWICH" in brand orange, "FACTORY" in amber —
  // echoes the two-accent palette and reads as a premium dark-theme wordmark.
  const [first, ...rest] = name.toUpperCase().split(" ");
  return (
    <View style={styles.row} accessibilityRole="header" accessibilityLabel={name}>
      <Text style={[styles.word, { color: colors.accent }]}>{first}</Text>
      {rest.length > 0 ? (
        <Text style={[styles.word, styles.spaced, { color: colors.accent2 }]}>{rest.join(" ")}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
  word: { fontSize: 18, fontWeight: "900", letterSpacing: 1.5 },
  spaced: { marginLeft: 6 },
});
