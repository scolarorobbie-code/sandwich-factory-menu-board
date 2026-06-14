import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";
import { colors } from "../theme";

export function Button({
  title,
  onPress,
  disabled,
  loading,
  variant = "primary",
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: "primary" | "secondary";
}) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        variant === "primary" ? styles.primary : styles.secondary,
        (pressed || isDisabled) && { opacity: 0.6 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === "primary" ? "#1a1410" : colors.text} />
      ) : (
        <Text style={[styles.label, variant === "secondary" && { color: colors.text }]}>{title}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: 14, paddingVertical: 16, alignItems: "center", justifyContent: "center" },
  primary: { backgroundColor: colors.accent2 },
  secondary: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line },
  label: { color: "#1a1410", fontSize: 16, fontWeight: "800", letterSpacing: 0.5 },
});
