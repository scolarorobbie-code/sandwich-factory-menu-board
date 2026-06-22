import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import RootNavigator from "./src/navigation/RootNavigator";
import { initSquarePayments } from "./src/payments/squarePayments";
import { setupNotifications } from "./src/push";
import { AuthProvider, useAuth } from "./src/state/auth";
import { CartProvider } from "./src/state/cart";
import { colors } from "./src/theme";

function Gate() {
  const { loading } = useAuth();
  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }
  return <RootNavigator />;
}

export default function App() {
  // Install the foreground notification handler once at launch so pushes render
  // while the app is open (independent of sign-in). Crash-proof / no-op on web
  // + Expo Go.
  useEffect(() => {
    setupNotifications();
    // Initialize Square's card tokenizer with the PUBLIC application id. No-op /
    // crash-proof in Expo Go + web (the SDK native module isn't present there);
    // on a real EAS build it readies the on-device card-entry flow.
    void initSquarePayments();
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <AuthProvider>
        <CartProvider>
          <Gate />
        </CartProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
