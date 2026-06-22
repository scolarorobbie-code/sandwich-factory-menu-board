import type { Modifier, ModifierGroup } from "@sf/contract";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useEffect, useRef, useState } from "react";
import { Alert, Animated, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { api } from "../api/client";
import { Button } from "../components/Button";
import * as haptics from "../haptics";
import { useAuth } from "../state/auth";
import { useCart } from "../state/cart";
import { colors, dollars } from "../theme";
import type { RootStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "ItemDetail">;

// --- Conditional modifiers ---
// A "Choose your drink" group only appears once a combo option is selected.
//
// Source of truth: the merchant control panel's `conditional` override data on
// the modifier group (contract field `ModifierGroup.conditional`). When the
// owner has configured ANY group on this item with conditional data, we drive
// visibility + auto-reveal purely from that data. When NO group carries it, we
// fall back to the legacy regex heuristic below so items the owner hasn't
// configured still behave exactly as before.
const isConditionalGroup = (g: ModifierGroup) => /drink/i.test(g.name);
const isComboTrigger = (name: string) =>
  /drink/i.test(name) || (/combo/i.test(name) && !/no\s+combo/i.test(name));

/** A group is data-conditional when the panel marked it hidden-until-triggered. */
const hasConditionalRule = (g: ModifierGroup) => g.conditional?.hiddenUntilTriggered === true;

/**
 * Does the current selection satisfy a group's `ConditionalRule`?
 * - a selected modifier id is in `triggerModifierIds`, OR
 * - a selected modifier belongs to a group in `triggerGroupIds`, OR
 * - (both lists empty) any non-conditional combo-trigger modifier is selected.
 */
function ruleTriggered(group: ModifierGroup, allGroups: ModifierGroup[], selected: Set<string>): boolean {
  const rule = group.conditional;
  if (!rule) return true;
  const modIds = rule.triggerModifierIds ?? [];
  const grpIds = rule.triggerGroupIds ?? [];
  if (modIds.length === 0 && grpIds.length === 0) {
    // No explicit trigger: reveal once anything in a non-conditional group is chosen.
    return allGroups
      .filter((g) => !hasConditionalRule(g))
      .flatMap((g) => g.modifiers)
      .some((m) => selected.has(m.id));
  }
  if (modIds.some((id) => selected.has(id))) return true;
  if (grpIds.length) {
    return allGroups
      .filter((g) => grpIds.includes(g.id))
      .flatMap((g) => g.modifiers)
      .some((m) => selected.has(m.id));
  }
  return false;
}

export default function ItemDetailScreen({ route, navigation }: Props) {
  const { item } = route.params;
  const cart = useCart();
  const { customer } = useAuth();
  const [saving, setSaving] = useState(false);

  const [variationId, setVariationId] = useState(item.variations[0]?.id);
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(item.modifierGroups.flatMap((g) => g.modifiers.filter((m) => m.selectedByDefault).map((m) => m.id))),
  );
  // Required groups start open; optional groups start collapsed.
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(item.modifierGroups.filter((g) => g.minSelections > 0).map((g) => g.id)),
  );
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState("");
  const addBtnScale = useRef(new Animated.Value(1)).current;

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggle(group: ModifierGroup, mod: Modifier) {
    haptics.selection();
    setSelected((prev) => {
      const next = new Set(prev);
      const groupIds = group.modifiers.map((m) => m.id);
      if (group.maxSelections <= 1) {
        groupIds.forEach((id) => next.delete(id));
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

  // Prefer the panel's conditional DATA when ANY group on this item carries it;
  // otherwise fall back to the legacy regex heuristic for unconfigured items.
  const groups = item.modifierGroups;
  const usingData = groups.some(hasConditionalRule);

  // Which groups are "conditional" (start hidden), and whether each is revealed.
  const isHidden = (g: ModifierGroup) => (usingData ? hasConditionalRule(g) : isConditionalGroup(g));
  const isRevealed = (g: ModifierGroup): boolean => {
    if (usingData) return ruleTriggered(g, groups, selected);
    // Regex fallback: any non-conditional combo-trigger modifier is selected.
    return groups
      .filter((x) => !isConditionalGroup(x))
      .flatMap((x) => x.modifiers)
      .some((m) => selected.has(m.id) && isComboTrigger(m.name));
  };
  const isVisible = (g: ModifierGroup) => !isHidden(g) || isRevealed(g);
  const visibleGroups = groups.filter(isVisible);

  // Auto-open a conditional group the moment its trigger is selected. Tracked by
  // a stable signature so the effect only re-runs when visibility actually changes.
  const revealedSig = groups.filter((g) => isHidden(g) && isRevealed(g)).map((g) => g.id).join(",");
  useEffect(() => {
    if (!revealedSig) return;
    setExpanded((prev) => {
      const next = new Set(prev);
      revealedSig.split(",").forEach((id) => next.add(id));
      return next;
    });
  }, [revealedSig]);

  // Hidden conditional groups don't count toward price, validation, or the cart.
  const chosenMods = visibleGroups.flatMap((g) => g.modifiers.filter((m) => selected.has(m.id)));
  const unit = variation.price.amount + chosenMods.reduce((s, m) => s + m.price.amount, 0);

  const isMissing = (g: ModifierGroup) =>
    g.minSelections > 0 && g.modifiers.filter((m) => selected.has(m.id)).length < g.minSelections;
  const missing = visibleGroups.filter(isMissing);

  function summary(g: ModifierGroup): string {
    const names = g.modifiers.filter((m) => selected.has(m.id)).map((m) => m.name);
    if (names.length) return names.join(", ");
    return g.minSelections > 0 ? "Required" : "Optional";
  }

  function addToCart() {
    haptics.tapMedium();
    cart.add(item, variation, chosenMods, quantity, note.trim() || undefined);
    // Brief press-scale animation, then navigate. The animation runs in parallel
    // with cart update so there's no added latency.
    Animated.sequence([
      Animated.timing(addBtnScale, { toValue: 0.93, duration: 55, useNativeDriver: true }),
      Animated.spring(addBtnScale, { toValue: 1, speed: 18, bounciness: 10, useNativeDriver: true }),
    ]).start(() => navigation.goBack());
  }

  async function persistFavorite(label: string) {
    setSaving(true);
    try {
      await api.createFavorite({
        name: label.trim() || item.name,
        lineItems: [
          {
            itemId: item.id,
            variationId: variation.id,
            quantity,
            modifierIds: chosenMods.map((m) => m.id),
            note: note.trim() || undefined,
          },
        ],
      });
      haptics.success();
      Alert.alert("Saved", `"${label.trim() || item.name}" is in your favorites.`);
    } catch (e) {
      haptics.warning();
      Alert.alert("Couldn't save", e instanceof Error ? e.message : "Try again.");
    } finally {
      setSaving(false);
    }
  }

  // Save this exact build as a favorite ("My usual") so it can be re-added in
  // one tap from Account → Favorites. Signed-in only.
  function saveFavorite() {
    if (missing.length) {
      haptics.warning();
      Alert.alert("Finish your build", `Choose ${missing[0].name} before saving.`);
      return;
    }
    haptics.tapLight();
    // Alert.prompt is iOS-only; on Android save straight away with a sensible name.
    if (typeof Alert.prompt === "function") {
      Alert.prompt(
        "Save as favorite",
        'Give this build a name (e.g. "My usual").',
        (name) => persistFavorite(name ?? item.name),
        "plain-text",
        item.name,
      );
    } else {
      persistFavorite(item.name);
    }
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
        {item.imageUrl ? <Image source={{ uri: item.imageUrl }} style={styles.hero} /> : null}
        {item.description ? <Text style={styles.desc}>{item.description}</Text> : null}

        {item.variations.length > 1 && (
          <View style={styles.block}>
            <Text style={styles.blockTitle}>Size</Text>
            <View style={{ gap: 8 }}>
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
            </View>
          </View>
        )}

        {visibleGroups.map((g) => {
          const open = expanded.has(g.id);
          const miss = isMissing(g);
          return (
            <View key={g.id} style={[styles.group, miss && styles.groupMissing]}>
              <Pressable style={styles.groupHeader} onPress={() => toggleExpand(g.id)}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.groupName}>{g.name}</Text>
                  <Text style={[styles.groupSummary, miss && { color: colors.accent }]} numberOfLines={1}>
                    {summary(g)}
                  </Text>
                </View>
                <Text style={styles.chevron}>{open ? "▾" : "▸"}</Text>
              </Pressable>
              {open && (
                <View style={{ marginTop: 10, gap: 8 }}>
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
                </View>
              )}
            </View>
          );
        })}

        <View style={styles.block}>
          <Text style={styles.blockTitle}>Special instructions</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. no onions"
            placeholderTextColor={colors.muted}
            value={note}
            onChangeText={setNote}
          />
        </View>

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
        <View style={styles.footerRow}>
          {customer ? (
            <Pressable
              style={[styles.heartBtn, saving && { opacity: 0.5 }]}
              onPress={saveFavorite}
              disabled={saving}
              accessibilityLabel="Save as favorite"
            >
              <Text style={styles.heartIcon}>♡</Text>
            </Pressable>
          ) : null}
          <Animated.View style={{ flex: 1, transform: [{ scale: addBtnScale }] }}>
            <Button
              title={missing.length ? `Choose ${missing[0].name}` : `Add ${quantity} · ${dollars(unit * quantity)}`}
              onPress={addToCart}
              disabled={missing.length > 0}
            />
          </Animated.View>
        </View>
      </View>
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
  hero: { width: "100%", height: 200, borderRadius: 16, marginBottom: 14, backgroundColor: "#2a2421" },
  desc: { color: colors.muted, fontSize: 16, lineHeight: 22 },

  block: { marginTop: 20 },
  blockTitle: { color: colors.text, fontSize: 18, fontWeight: "800", marginBottom: 10 },

  group: {
    marginTop: 12,
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
  },
  groupMissing: { borderColor: colors.accent },
  groupHeader: { flexDirection: "row", alignItems: "center" },
  groupName: { color: colors.text, fontSize: 17, fontWeight: "800" },
  groupSummary: { color: colors.muted, fontSize: 13, marginTop: 3 },
  chevron: { color: colors.accent2, fontSize: 18, fontWeight: "800", marginLeft: 10 },

  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.bg,
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
  footerRow: { flexDirection: "row", alignItems: "stretch", gap: 12 },
  heartBtn: {
    width: 54,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
  },
  heartIcon: { color: colors.accent, fontSize: 26, fontWeight: "800" },
});
