
import React, { useEffect } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { useFonts } from "expo-font";
import "react-native-reanimated";
import * as SplashScreen from "expo-splash-screen";
import { WidgetProvider } from "@/contexts/WidgetContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { RevenueCatProvider } from "@/contexts/RevenueCatContext";
import { useColorScheme } from "react-native";
import { SystemBars } from "react-native-edge-to-edge";
import { StatusBar } from "expo-status-bar";
import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useNetworkState } from "expo-network";

function RootLayoutNav() {
  const { user, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) {
      console.log('RootLayoutNav: Auth loading, waiting...');
      return;
    }

    const inAuthGroup = segments[0] === '(tabs)';
    
    console.log('RootLayoutNav: Auth check - user:', user?.email || 'null', 'inAuthGroup:', inAuthGroup);

    if (!user && inAuthGroup) {
      console.log('RootLayoutNav: No user, redirecting to login');
      router.replace('/login');
    } else if (user && !inAuthGroup) {
      console.log('RootLayoutNav: User logged in, redirecting to home');
      router.replace('/(tabs)/(home)');
    }
  }, [user, loading, segments, router]);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="signup" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="settings" options={{ headerShown: false }} />
      <Stack.Screen name="+not-found" />
    </Stack>
  );
}

export default function RootLayout() {
  const { isConnected } = useNetworkState();
  const [loaded] = useFonts({
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
  });

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  const colorScheme = useColorScheme();

  if (!loaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <RevenueCatProvider>
          <LanguageProvider>
            <WidgetProvider>
              <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
                <SystemBars style={colorScheme === "dark" ? "light" : "dark"} />
                <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
                <RootLayoutNav />
              </ThemeProvider>
            </WidgetProvider>
          </LanguageProvider>
        </RevenueCatProvider>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
