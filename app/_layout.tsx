
import React, { useEffect, useState } from "react";
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
import AsyncStorage from "@react-native-async-storage/async-storage";

const LANGUAGE_STORAGE_KEY = 'selectedLanguage';

function RootLayoutNav() {
  const { user, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const [hasLanguage, setHasLanguage] = useState<boolean | null>(null);
  const [isGuest, setIsGuest] = useState<boolean | null>(null);

  const checkLanguageSelection = async () => {
    try {
      const [savedLanguage, guestFlag] = await Promise.all([
        AsyncStorage.getItem(LANGUAGE_STORAGE_KEY),
        AsyncStorage.getItem('is_guest'),
      ]);
      console.log('RootLayoutNav: Checking language selection:', savedLanguage);
      console.log('RootLayoutNav: Checking guest flag:', guestFlag);
      setHasLanguage(!!savedLanguage);
      setIsGuest(guestFlag === 'true');
    } catch (error) {
      console.error('RootLayoutNav: Error checking language/guest:', error);
      setHasLanguage(false);
      setIsGuest(false);
    }
  };

  useEffect(() => {
    checkLanguageSelection();
  }, []);

  useEffect(() => {
    if (segments[0] === 'login' || segments[0] === 'signup') {
      checkLanguageSelection();
    }
  }, [segments]);

  useEffect(() => {
    if (user === null) {
      console.log('RootLayoutNav: user signed out, re-reading AsyncStorage to refresh isGuest');
      checkLanguageSelection();
    }
  }, [user]);

  useEffect(() => {
    if (loading || hasLanguage === null || isGuest === null) {
      console.log('RootLayoutNav: Auth or language or guest loading, waiting...');
      return;
    }

    const inAuthGroup = segments[0] === '(tabs)';
    const onLanguageSelect = segments[0] === 'language-select';
    const onSettings = segments[0] === 'settings';
    const onLogin = segments[0] === 'login';
    const onSignup = segments[0] === 'signup';
    
    console.log('RootLayoutNav: Auth check - user:', user?.email || 'null', 'inAuthGroup:', inAuthGroup, 'hasLanguage:', hasLanguage, 'onSettings:', onSettings);

    // Priority 1: No language selected -> go to language selection
    if (!hasLanguage && !onLanguageSelect) {
      console.log('RootLayoutNav: No language selected, redirecting to language-select');
      router.replace('/language-select');
      return;
    }

    // Priority 2: User is logged in (or is a guest) and has language -> go to home
    // Skip if already in tabs, on language-select, on settings, on login, or on signup
    if ((user || isGuest) && hasLanguage && !inAuthGroup && !onLanguageSelect && !onSettings && !onLogin && !onSignup) {
      console.log('RootLayoutNav: User/guest with language, redirecting to home');
      router.replace('/(tabs)/(home)');
      return;
    }

    // Priority 3: No user and not a guest but trying to access protected routes -> go to signup
    if (!user && !isGuest && (inAuthGroup || onSettings)) {
      console.log('RootLayoutNav: No user and not a guest in protected route, redirecting to signup');
      router.replace('/signup');
      return;
    }
  }, [user, loading, segments, router, hasLanguage, isGuest]);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="language-select" options={{ headerShown: false }} />
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
