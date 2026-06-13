import type { Modifier, ModifierGroup } from "@sf/contract";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Button } from "../components/Button";
import { useCart } from "../state/cart";
import { colors, dollars } from "../theme";
import type { RootStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "ItemDetail">;

export default function ItemDetailScreen({ route, navigation }: Props) {
  const { item } = route.params;
  const cart = useCart();

  const [variationId, setVariationId] = useState(item.variations[0]?.id);
  // Pre-select any default modifiers.
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(item.modifierGroups.flatMap((g) => g.modifiers.filter((m) => m.selectedByDefault).map((m) => m.id))),
  );
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState("");

  function toggle(group: ModifierGroup, mod: Modifier) {
    setSelected((prev) => {
      const next = new Set(prev);
      const groupIds = group.modifiers.map((m) => m.id);
      if (group.maxSelections <= 1) {
        groupIds.forEach((id) => next.delete(id)); // single-select: clear group first
        next.add(mod.id);
      } else if (next.has(mod.id)) {
        next.delete(mod.id);
      } else {
        const chosenInGroup = groupIds.filter((id) => next.has(id)).length;
        if (chosenInGroup < group.maxSelections) next.add(mod.id);
      }
      return next;
    });
  }

  const variation = item.variations.find((v) => v.id === variationId)!;
  const chosenMods = item.modifierGroups.flatMap((g) => g.modifiers.filter((m) => selected.has(m.id)));
  const unit = variation.price.amount + chosenMods.reduce((s, m) => s + m.price.amount, 0);

  // Validate required (min) selections per group.
  const missing = item.modifierGroups.filter(
    (g) => g.minSelections > 0 && g.modifiers.filter((m) => selected.has(m.id)).length < g.minSelections,
  );

  function addToCart() {
    cart.add(item, variation, chosenMods, quantity, note.trim() || undefined);
    navigation.goBack();
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
        {item.description ? <Text style={styles.desc}>{item.description}</Text> : null}

        {item.variations.length > 1 && (
          <Group title="Size">
            {item.variations.map((v) => (
              <Row
                key={v.id}
                label={v.name}
                price={v.price.amount ? `+${dollars(v.price.amount)}` : dollars(v.price.amount)}
                selected={v.id === variationId}
                kind="radio"
                onPress={() => setVariationId(v.id)}
              />
            ))}
          </Group>
        )}

        {item.modifierGroups.map((g) => (
          <Group key={g.id} title={g.name} subtitle={g.minSelections > 0 ? "Required" : "Optional"}>
            {g.modifiers.map((m) => (
              <Row
                key={m.id}
                label={m.name}
                price={m.price.amount ? `+${dollars(m.price.amount)}` : ""}
                selected={selected.has(m.id)}
                kind={g.maxSelections <= 1 ? "radio" : "check"}
                disabled={!m.available}
                onPress={() => toggle(g, m)}
              />
            ))}
          </Group>
        ))}

        <Group title="Special instructions">
          <TextInput
            style={styles.input}
            placeholder="e.g. no onions"
            placeholderTextColor={colors.muted}
            value={note}
            onChangeText={setNote}
          />
        </Group>

        <View style={styles.qtyRow}>
          <Text style={styles.qtyLabel}>Quantity</Text>
          <View style={styles.stepper}>
            <Stepper label="−" onPress={() => setQuantity((q) => Math.max(1, q - 1))} />
            <Text style={styles.qty}>{quantity}</Text>
            <Stepper label="+" onPress={() => setQuantity((q) => q + 1)} />
          </View>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Button
          title={missing.length ? `Choose ${missing[0].name}` : `Add ${quantity} · ${dollars(unit * quantity)}`}
          onPress={addToCart}
          disabled={missing.length > 0}
        />
      </View>
    </View>
  );
}

function Group({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: 18 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text style={styles.groupTitle}>{title}</Text>
        {subtitle ? <Text style={styles.groupSub}>{subtitle}</Text> : null}
      </View>
      <View style={{ marginTop: 8, gap: 8 }}>{children}</View>
    </View>
  );
}

function Row({
  label,
  price,
  selected,
  kind,
  disabled,
  onPress,
}: {
  label: string;
  price?: string;
  selected: boolean;
  kind: "radio" | "check";
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={[styles.row, disabled && { opacity: 0.4 }]} onPress={disabled ? undefined : onPress}>
      <View style={[styles.marker, kind === "radio" && { borderRadius: 11 }, selected && styles.markerOn]}>
        {selected ? <Text style={styles.markerTick}>✓</Text> : null}
      </View>
      <Text style={styles.rowLabel}>{label}</Text>
      {price ? <Text style={styles.rowPrice}>{price}</Text> : null}
    </Pressable>
  );
}

function Stepper({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.stepBtn} onPress={onPress}>
      <Text style={styles.stepBtnText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  desc: { color: colors.muted, fontSize: 16, lineHeight: 22 },
  groupTitle: { color: colors.text, fontSize: 18, fontWeight: "800" },
  groupSub: { color: colors.muted, fontSize: 13 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.line,
  },
  marker: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.muted,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  markerOn: { backgroundColor: colors.accent2, borderColor: colors.accent2 },
  markerTick: { color: "#1a1410", fontSize: 13, fontWeight: "900" },
  rowLabel: { color: colors.text, fontSize: 16, flex: 1 },
  rowPrice: { color: colors.accent2, fontSize: 15, fontWeight: "700" },
  input: { backgroundColor: colors.card, borderRadius: 12, padding: 14, color: colors.text, borderWidth: 1, borderColor: colors.line },
  qtyRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 24 },
  qtyLabel: { color: colors.text, fontSize: 18, fontWeight: "800" },
  stepper: { flexDirection: "row", alignItems: "center", gap: 18 },
  stepBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.card, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.line },
  stepBtnText: { color: colors.text, fontSize: 22, fontWeight: "800" },
  qty: { color: colors.text, fontSize: 20, fontWeight: "800", minWidth: 24, textAlign: "center" },
  footer: { padding: 16, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.bg2 },
});
