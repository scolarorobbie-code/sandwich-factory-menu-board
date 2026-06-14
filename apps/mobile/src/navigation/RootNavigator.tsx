import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { DarkTheme, NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Text } from "react-native";
import { useCart } from "../state/cart";
import { colors } from "../theme";
import AccountScreen from "../screens/AccountScreen";
import AuthScreen from "../screens/AuthScreen";
import CartScreen from "../screens/CartScreen";
import CheckoutScreen from "../screens/CheckoutScreen";
import DealsScreen from "../screens/DealsScreen";
import ItemDetailScreen from "../screens/ItemDetailScreen";
import MenuScreen from "../screens/MenuScreen";
import OrderStatusScreen from "../screens/OrderStatusScreen";
import type { RootStackParamList, TabParamList } from "./types";

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

const icon = (emoji: string) => () => <Text style={{ fontSize: 20 }}>{emoji}</Text>;

function Tabs() {
  const cart = useCart();
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
        options={{ tabBarIcon: icon("🥪"), tabBarBadge: cart.count || undefined }}
      />
      <Tab.Screen name="Deals" component={DealsScreen} options={{ tabBarIcon: icon("🔥") }} />
      <Tab.Screen name="Account" component={AccountScreen} options={{ tabBarIcon: icon("⭐") }} />
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
      </Stack.Navigator>
    </NavigationContainer>
  );
}
