import type { AuthResponse, Customer } from "@sf/contract";
import * as SecureStore from "expo-secure-store";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, setTokenProvider } from "../api/client";

const ACCESS_KEY = "sf.accessToken";
const REFRESH_KEY = "sf.refreshToken";

interface AuthState {
  customer: Customer | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, firstName: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Make the current access token available to the API client.
  useEffect(() => {
    setTokenProvider(() => accessToken);
  }, [accessToken]);

  // Restore session on launch.
  useEffect(() => {
    (async () => {
      try {
        const refresh = await SecureStore.getItemAsync(REFRESH_KEY);
        if (refresh) {
          const tokens = await api.refresh(refresh);
          setAccessToken(tokens.accessToken);
          setTokenProvider(() => tokens.accessToken);
          await SecureStore.setItemAsync(ACCESS_KEY, tokens.accessToken);
          setCustomer(await api.me());
        }
      } catch {
        await clearTokens();
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function applyAuth(res: AuthResponse) {
    setAccessToken(res.accessToken);
    setTokenProvider(() => res.accessToken);
    await SecureStore.setItemAsync(ACCESS_KEY, res.accessToken);
    await SecureStore.setItemAsync(REFRESH_KEY, res.refreshToken);
    setCustomer(res.customer);
  }

  async function clearTokens() {
    await SecureStore.deleteItemAsync(ACCESS_KEY);
    await SecureStore.deleteItemAsync(REFRESH_KEY);
    setAccessToken(null);
    setCustomer(null);
  }

  const value = useMemo<AuthState>(
    () => ({
      customer,
      loading,
      signIn: async (email, password) => applyAuth(await api.login({ email, password })),
      signUp: async (email, password, firstName) =>
        applyAuth(await api.register({ email, password, firstName })),
      signOut: clearTokens,
    }),
    [customer, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
