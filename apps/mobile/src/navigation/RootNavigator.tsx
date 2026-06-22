import Ionicons from "@expo/vector-icons/Ionicons";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { DarkTheme, NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useEffect, useRef } from "react";
import { Animated } from "react-native";
import { useCart } from "../state/cart";
import { colors } from "../theme";
import { Brandmark } from "../components/Brandmark";
import AccountScreen from "../screens/AccountScreen";
import AuthScreen from "../screens/AuthScreen";
import CartScreen from "../screens/CartScreen";
import CheckoutScreen from "../screens/CheckoutScreen";
import DealsScreen from "../screens/DealsScreen";
import ItemDetailScreen from "../screens/ItemDetailScreen";
import MenuScreen from "../screens/MenuScreen";
import OrderStatusScreen from "../screens/OrderStatusScreen";
import SettingsScreen from "../screens/SettingsScreen";
import type { RootStackParamList, TabParamList } from "./types";

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

function Tabs() {
  const cart = useCart();
  // Bounce the Menu tab icon whenever an item is added to the cart.
  const iconScale = useRef(new Animated.Value(1)).current;
  const prevCount = useRef(cart.count);
  useEffect(() => {
    if (cart.count > prevCount.current) {
      Animated.sequence([
        Animated.timing(iconScale, { toValue: 1.3, duration: 70, useNativeDriver: true }),
        Animated.spring(iconScale, { toValue: 1, speed: 14, bounciness: 14, useNativeDriver: true }),
      ]).start();
    }
    prevCount.current = cart.count;
  }, [cart.count, iconScale]);

  return (
    <Tab.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg2 },
        headerTitleStyle: { color: colors.text },
        headerTintColor: colors.accent2,
        tabBarStyle: { backgroundColor: colors.bg2, borderTopColor: colors.line },
        tabBarActiveTintColor: colors.accent2,
        tabBarInactiveTintColor: colors.muted,
      }}
    >
      <Tab.Screen
        name="Menu"
        component={MenuScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Animated.View style={{ transform: [{ scale: iconScale }] }}>
              <Ionicons name="restaurant-outline" size={size} color={color} />
            </Animated.View>
          ),
          tabBarBadge: cart.count || undefined,
          headerTitle: () => <Brandmark />,
          headerTitleAlign: "center",
        }}
      />
      <Tab.Screen
        name="Deals"
        component={DealsScreen}
        options={{ tabBarIcon: ({ color, size }) => <Ionicons name="pricetag-outline" size={size} color={color} /> }}
      />
      <Tab.Screen
        name="Account"
        component={AccountScreen}
        options={{ tabBarIcon: ({ color, size }) => <Ionicons name="person-circle-outline" size={size} color={color} /> }}
      />
    </Tab.Navigator>
  );
}

export default function RootNavigator() {
  return (
    <NavigationContainer theme={DarkTheme}>
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg2 },
          headerTitleStyle: { color: colors.text },
          headerTintColor: colors.accent2,
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
        <Stack.Screen
          name="ItemDetail"
          component={ItemDetailScreen}
          options={({ route }) => ({ title: route.params.item.name })}
        />
        <Stack.Screen name="Cart" component={CartScreen} options={{ title: "Your Cart" }} />
        <Stack.Screen name="Auth" component={AuthScreen} options={{ title: "Sign In" }} />
        <Stack.Screen name="Checkout" component={CheckoutScreen} options={{ title: "Checkout" }} />
        <Stack.Screen name="OrderStatus" component={OrderStatusScreen} options={{ title: "Order Status" }} />
        <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: "Settings" }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
