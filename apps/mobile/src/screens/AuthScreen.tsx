import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Button } from "../components/Button";
import { useAuth } from "../state/auth";
import { colors } from "../theme";
import type { RootStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "Auth">;

export default function AuthScreen({ route, navigation }: Props) {
  const { signIn, signUp } = useAuth();
  const next = route.params?.next;
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Loose check only — warn, never block. Square wants E.164 (or a bare 10-digit
  // US number it can coerce). An empty phone is always fine (it's optional).
  const phoneTrimmed = phone.trim();
  const phoneDigits = phoneTrimmed.replace(/\D/g, "");
  const phoneLooksOff =
    phoneTrimmed.length > 0 && !(phoneDigits.length === 10 || (phoneDigits.length === 11 && phoneDigits.startsWith("1")) || /^\+[1-9]\d{6,14}$/.test(phoneTrimmed));

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      if (mode === "signin") await signIn(email.trim(), password);
      else await signUp(email.trim(), password, firstName.trim(), phoneTrimmed || undefined);
      if (next === "Checkout") navigation.replace("Checkout");
      else navigation.goBack();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>{mode === "signin" ? "Welcome back" : "Create your account"}</Text>
      <Text style={styles.muted}>Sign in to order, earn Stars, and reorder favorites.</Text>

      {mode === "signup" && (
        <TextInput
          style={styles.input}
          placeholder="First name"
          placeholderTextColor={colors.muted}
          value={firstName}
          onChangeText={setFirstName}
        />
      )}
      <TextInput
        style={styles.input}
        placeholder="Email"
        placeholderTextColor={colors.muted}
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        placeholderTextColor={colors.muted}
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      {mode === "signup" && (
        <>
          <TextInput
            style={styles.input}
            placeholder="Mobile number (optional)"
            placeholderTextColor={colors.muted}
            keyboardType="phone-pad"
            textContentType="telephoneNumber"
            value={phone}
            onChangeText={setPhone}
          />
          <Text style={phoneLooksOff ? styles.phoneWarn : styles.phoneHint}>
            {phoneLooksOff
              ? "That doesn't look like a phone number — double-check it (we'll still let you continue)."
              : "Add your number to earn ⭐ Stars on every order. We use it to find your rewards at the register."}
          </Text>
        </>
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={{ height: 8 }} />
      <Button title={mode === "signin" ? "Sign In" : "Sign Up"} onPress={submit} loading={busy} />

      <Pressable onPress={() => setMode(mode === "signin" ? "signup" : "signin")} style={{ marginTop: 18 }}>
        <Text style={styles.toggle}>
          {mode === "signin" ? "New here? Create an account" : "Already have an account? Sign in"}
        </Text>
      </Pressable>

      <Text style={styles.appleNote}>
        Sign in with Apple will appear here on the EAS build (it needs native code, not available in Expo Go).
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, padding: 20 },
  title: { color: colors.text, fontSize: 26, fontWeight: "800", marginTop: 12 },
  muted: { color: colors.muted, fontSize: 15, marginTop: 8, marginBottom: 20 },
  input: { backgroundColor: colors.card, borderRadius: 12, padding: 16, color: colors.text, fontSize: 16, borderWidth: 1, borderColor: colors.line, marginBottom: 12 },
  error: { color: colors.accent, fontSize: 14, marginTop: 4 },
  phoneHint: { color: colors.muted, fontSize: 12, marginTop: -4, marginBottom: 12, lineHeight: 17 },
  phoneWarn: { color: colors.accent2, fontSize: 12, marginTop: -4, marginBottom: 12, lineHeight: 17 },
  toggle: { color: colors.cyan, fontSize: 15, textAlign: "center" },
  appleNote: { color: colors.muted, fontSize: 12, marginTop: 28, textAlign: "center", lineHeight: 18 },
});
