import { useCallback, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { api } from "../api/client";
import { Button } from "../components/Button";
import * as haptics from "../haptics";
import { useAuth } from "../state/auth";
import { colors } from "../theme";

/**
 * Account → Settings. Two sections:
 *  1. Notifications — shows the current push-permission status and a button to
 *     open the OS settings so the customer can enable order-status alerts.
 *  2. Edit profile — name + PHONE. Phone matters: Apple Sign-In users have none,
 *     which blocks Square Loyalty (Stars are mapped by phone). Saved via PATCH /me.
 *
 * Everything here is crash-proof: the permission read lazily requires
 * expo-notifications and no-ops (status "unknown") when it isn't available
 * (Expo Go / web / sim), exactly like the app's other native wrappers.
 */

type PushStatus = "granted" | "denied" | "undetermined" | "unknown";

/**
 * Read the current notification permission WITHOUT prompting. Lazy-required and
 * fully guarded so a missing native module can never crash the screen.
 */
async function readPushStatus(): Promise<PushStatus> {
  if (Platform.OS !== "ios" && Platform.OS !== "android") return "unknown";
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const N = require("expo-notifications") as typeof import("expo-notifications");
    const s = await N.getPermissionsAsync();
    if (s.granted || s.ios?.status === N.IosAuthorizationStatus.PROVISIONAL) return "granted";
    if (s.canAskAgain === false) return "denied";
    return s.status === "denied" ? "denied" : "undetermined";
  } catch {
    return "unknown";
  }
}

export default function SettingsScreen() {
  const { customer, updateCustomer } = useAuth();

  const [pushStatus, setPushStatus] = useState<PushStatus>("unknown");
  const [firstName, setFirstName] = useState(customer?.firstName ?? "");
  const [lastName, setLastName] = useState(customer?.lastName ?? "");
  const [phone, setPhone] = useState(customer?.phone ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Re-read the permission each time the screen regains focus (e.g. coming back
  // from the OS Settings app after the user toggled notifications).
  useFocusEffect(
    useCallback(() => {
      let active = true;
      readPushStatus().then((s) => {
        if (active) setPushStatus(s);
      });
      return () => {
        active = false;
      };
    }, []),
  );

  if (!customer) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Sign in to manage your settings.</Text>
      </View>
    );
  }

  const phoneMissing = !customer.phone;

  const dirty =
    firstName.trim() !== (customer.firstName ?? "") ||
    (lastName.trim() || "") !== (customer.lastName ?? "") ||
    (phone.trim() || "") !== (customer.phone ?? "");

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await api.updateProfile({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim(),
      });
      updateCustomer(updated);
      haptics.success();
      setSaved(true);
    } catch (e) {
      haptics.warning();
      setError(e instanceof Error ? e.message : "Couldn't save your changes");
    } finally {
      setSaving(false);
    }
  }

  function openOsSettings() {
    haptics.tapLight();
    // openSettings() deep-links into THIS app's OS settings page, where the user
    // toggles notifications. Guarded — never throws if unsupported.
    Linking.openSettings().catch(() => {});
  }

  const pushCopy: Record<PushStatus, { label: string; tone: "good" | "warn" | "muted" }> = {
    granted: { label: "On — you'll get order updates", tone: "good" },
    denied: { label: "Off — turn on to get order updates", tone: "warn" },
    undetermined: { label: "Not set up yet", tone: "warn" },
    unknown: { label: "Available on the installed app", tone: "muted" },
  };
  const push = pushCopy[pushStatus];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
      {/* Notifications */}
      <Text style={styles.section} accessibilityRole="header">
        Notifications
      </Text>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Order updates</Text>
        <Text
          style={[
            styles.statusLine,
            push.tone === "good" && { color: colors.accent2 },
            push.tone === "warn" && { color: colors.accent },
          ]}
          accessibilityLabel={`Notification status: ${push.label}`}
        >
          {pushStatus === "granted" ? "🔔 " : "🔕 "}
          {push.label}
        </Text>
        <Text style={styles.help}>
          We'll ping you the moment your order is being made and when it's ready for pickup.
        </Text>
        <View style={{ height: 12 }} />
        <Button
          title={pushStatus === "granted" ? "Open notification settings" : "Enable notifications"}
          variant="secondary"
          onPress={openOsSettings}
        />
      </View>

      {/* Edit profile */}
      <Text style={styles.section} accessibilityRole="header">
        Your profile
      </Text>
      <View style={styles.card}>
        <Text style={styles.label}>First name</Text>
        <TextInput
          style={styles.input}
          value={firstName}
          onChangeText={(t) => {
            setFirstName(t);
            setSaved(false);
          }}
          placeholder="First name"
          placeholderTextColor={colors.muted}
          autoCapitalize="words"
          accessibilityLabel="First name"
        />

        <Text style={styles.label}>Last name</Text>
        <TextInput
          style={styles.input}
          value={lastName}
          onChangeText={(t) => {
            setLastName(t);
            setSaved(false);
          }}
          placeholder="Last name (optional)"
          placeholderTextColor={colors.muted}
          autoCapitalize="words"
          accessibilityLabel="Last name"
        />

        <Text style={styles.label}>Phone</Text>
        <TextInput
          style={styles.input}
          value={phone}
          onChangeText={(t) => {
            setPhone(t);
            setSaved(false);
          }}
          placeholder="(615) 555-0123"
          placeholderTextColor={colors.muted}
          keyboardType="phone-pad"
          accessibilityLabel="Phone number"
          accessibilityHint="Used to earn and redeem Stars"
        />
        {phoneMissing ? (
          <Text style={styles.phoneNudge}>
            ⭐ Add a phone number to earn and redeem Stars on your orders.
          </Text>
        ) : (
          <Text style={styles.help}>Your Stars are tied to this number.</Text>
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {saved && !dirty ? <Text style={styles.savedNote}>✓ Saved</Text> : null}

        <View style={{ height: 16 }} />
        <Button title="Save changes" onPress={save} loading={saving} disabled={!dirty || !firstName.trim()} />
      </View>

      <View style={{ height: 8 }} />
      <Pressable
        onPress={() => Linking.openURL("tel:+16154941211").catch(() => {})}
        accessibilityRole="button"
        accessibilityLabel="Call the store"
      >
        <Text style={styles.callStore}>Questions? Call the store · (615) 494-1211</Text>
      </Pressable>

      {saving ? <ActivityIndicator style={{ marginTop: 12 }} color={colors.accent2} /> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg, padding: 24 },
  section: { color: colors.accent2, fontSize: 20, fontWeight: "800", marginTop: 8, marginBottom: 12 },
  card: { backgroundColor: colors.card, borderRadius: 16, padding: 18, borderWidth: 1, borderColor: colors.line, marginBottom: 12 },
  cardTitle: { color: colors.text, fontSize: 16, fontWeight: "800" },
  statusLine: { color: colors.muted, fontSize: 15, fontWeight: "700", marginTop: 8 },
  help: { color: colors.muted, fontSize: 13, marginTop: 8, lineHeight: 19 },
  label: { color: colors.muted, fontSize: 13, fontWeight: "700", marginTop: 14, marginBottom: 6, letterSpacing: 0.3 },
  input: {
    backgroundColor: colors.bg2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    color: colors.text,
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 48,
  },
  phoneNudge: { color: colors.accent2, fontSize: 13, marginTop: 8, fontWeight: "600", lineHeight: 19 },
  error: { color: colors.accent, fontSize: 14, marginTop: 14, textAlign: "center" },
  savedNote: { color: colors.accent2, fontSize: 14, fontWeight: "700", marginTop: 14, textAlign: "center" },
  muted: { color: colors.muted, fontSize: 15, textAlign: "center" },
  callStore: { color: colors.muted, fontSize: 13, textAlign: "center", marginTop: 8, textDecorationLine: "underline" },
});
