import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { colors } from '@/styles/commonStyles';
import { useLanguage, LANGUAGES } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { translate } from '@/constants/translations';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function SettingsScreen() {
  console.log('SettingsScreen: Component rendered');

  const router = useRouter();
  const { selectedLanguage, setSelectedLanguage } = useLanguage();
  const { signOut, user } = useAuth();

  const [isLoggingOut, setIsLoggingOut] = useState(false);

  console.log('SettingsScreen: Current selectedLanguage:', selectedLanguage);
  console.log('SettingsScreen: Current user:', user?.email || 'null');

  const doLogout = async () => {
    console.log('SettingsScreen: doLogout started');
    setIsLoggingOut(true);

    // Navigate FIRST
    router.replace('/signup');

    // Then clean up
    try {
      await AsyncStorage.multiRemove(['is_guest', 'guest_scan_count']);
      await signOut();
      console.log('SettingsScreen: signOut complete');
    } catch (e) {
      console.log('SettingsScreen: signOut error:', e);
    } finally {
      setIsLoggingOut(false);
    }
  };

  const handleLogoutPress = () => {
    console.log('SettingsScreen: User tapped logout button');

    const title = translate('settings', 'logoutModalTitle', selectedLanguage);
    const message = translate('settings', 'logoutModalMessage', selectedLanguage);
    const cancelText = translate('settings', 'cancel', selectedLanguage);
    const confirmText = translate('settings', 'logout', selectedLanguage);

    Alert.alert(
      title,
      message,
      [
        {
          text: cancelText,
          style: 'cancel',
          onPress: () => console.log('SettingsScreen: User cancelled logout'),
        },
        {
          text: confirmText,
          style: 'destructive',
          onPress: doLogout,
        },
      ],
      { cancelable: true }
    );
  };

  const handleLanguageSelect = async (code: string) => {
    console.log('SettingsScreen: User selected language:', code);
    await setSelectedLanguage(code);
  };

  const backButtonText = translate('settings', 'back', selectedLanguage);
  const screenTitle = translate('settings', 'title', selectedLanguage);
  const logoutButtonText = translate('settings', 'logout', selectedLanguage);

  const appVersion = Constants.expoConfig?.version || '1.0.0';

  const languageOptions = [
    { code: 'uk', label: 'Українська', flag: '🇺🇦' },
    { code: 'en', label: 'English', flag: '🇬🇧' },
    { code: 'nl', label: 'Nederlands', flag: '🇳🇱' },
    { code: 'pl', label: 'Polski', flag: '🇵🇱' },
    { code: 'tr', label: 'Türkçe', flag: '🇹🇷' },
    { code: 'de', label: 'Deutsch', flag: '🇩🇪' },
    { code: 'fr', label: 'Français', flag: '🇫🇷' },
    { code: 'es', label: 'Español', flag: '🇪🇸' },
    { code: 'ar', label: 'العربية', flag: '🇸🇦' },
  ];

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: screenTitle,
          headerBackTitle: backButtonText,
          headerStyle: {
            backgroundColor: '#F8FAFC',
          },
          headerTintColor: '#0F172A',
          headerShadowVisible: true,
        }}
      />
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={true}
        >
          {/* Language Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Language / Мова</Text>
            <View style={styles.languageGrid}>
              {languageOptions.map((language, index) => {
                const isSelected = selectedLanguage === language.code;
                const cardStyle = isSelected
                  ? [styles.languageCard, styles.languageCardSelected]
                  : styles.languageCard;

                return (
                  <TouchableOpacity
                    key={index}
                    style={cardStyle}
                    onPress={() => handleLanguageSelect(language.code)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.languageFlag}>{language.flag}</Text>
                    <Text style={styles.languageLabel}>{language.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* About Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>About</Text>
            <View style={styles.aboutCard}>
              <View style={styles.aboutRow}>
                <Text style={styles.aboutLabel}>App Version</Text>
                <Text style={styles.aboutValue}>{appVersion}</Text>
              </View>
              <View style={styles.aboutRow}>
                <Text style={styles.aboutLabel}>App Name</Text>
                <Text style={styles.aboutValue}>DocuScan</Text>
              </View>
            </View>
          </View>

          {/* Logout Section */}
          <View style={styles.logoutSection}>
            <TouchableOpacity
              style={[styles.logoutButton, isLoggingOut && { opacity: 0.6 }]}
              onPress={handleLogoutPress}
              activeOpacity={0.8}
              disabled={isLoggingOut}
            >
              <Text style={styles.logoutButtonText}>
                {isLoggingOut ? 'Signing out...' : logoutButtonText}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    paddingTop: Platform.OS === 'android' ? 48 : 0,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 120,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 16,
  },
  languageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
  },
  languageCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    borderRadius: 14,
    padding: 16,
    width: '48%',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  languageCardSelected: {
    borderWidth: 2,
    borderColor: '#3B82F6',
    backgroundColor: 'rgba(59,130,246,0.04)',
  },
  languageFlag: {
    fontSize: 28,
    marginBottom: 8,
  },
  languageLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
    textAlign: 'center',
  },
  aboutCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    borderRadius: 14,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  aboutRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(15,23,42,0.06)',
  },
  aboutLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#475569',
  },
  aboutValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
  },
  logoutSection: {
    marginTop: 32,
    paddingTop: 24,
  },
  logoutButton: {
    backgroundColor: '#DC2626',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#DC2626',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 4,
  },
  logoutButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
