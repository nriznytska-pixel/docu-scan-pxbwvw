
import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface LanguageOption {
  code: string;
  label: string;
  flag: string;
  enabled: boolean;
}

const LANGUAGE_OPTIONS: LanguageOption[] = [
  { code: 'uk', label: 'Українська', flag: '🇺🇦', enabled: true },
  { code: 'en', label: 'English', flag: '🇬🇧', enabled: true },
  { code: 'nl', label: 'Nederlands', flag: '🇳🇱', enabled: true },
  { code: 'pl', label: 'Polski', flag: '🇵🇱', enabled: true },
  { code: 'tr', label: 'Türkçe', flag: '🇹🇷', enabled: true },
  { code: 'de', label: 'Deutsch', flag: '🇩🇪', enabled: true },
  { code: 'fr', label: 'Français', flag: '🇫🇷', enabled: true },
  { code: 'es', label: 'Español', flag: '🇪🇸', enabled: true },
  { code: 'ar', label: 'العربية', flag: '🇸🇦', enabled: true },
];

const LANGUAGE_STORAGE_KEY = 'selectedLanguage';

export default function LanguageSelectScreen() {
  console.log('LanguageSelectScreen: Component rendered');
  
  const router = useRouter();
  const [selectedLanguage, setSelectedLanguage] = useState<string | null>(null);

  const handleLanguageSelect = (code: string, enabled: boolean) => {
    if (!enabled) {
      console.log('LanguageSelectScreen: User tapped disabled language:', code);
      return;
    }
    
    console.log('LanguageSelectScreen: User selected language:', code);
    setSelectedLanguage(code);
  };

  const handleContinue = async () => {
    console.log('LanguageSelectScreen: Continue button tapped, selectedLanguage:', selectedLanguage);
    
    if (!selectedLanguage) {
      console.log('LanguageSelectScreen: Continue tapped but no language selected');
      return;
    }

    console.log('LanguageSelectScreen: Saving language to AsyncStorage:', selectedLanguage);
    
    try {
      await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, selectedLanguage);
      console.log('LanguageSelectScreen: Language saved successfully, navigating to login');
      router.replace('/login');
    } catch (error) {
      console.error('LanguageSelectScreen: Error saving language:', error);
    }
  };

  const titleText = 'Choose your language';
  const subtitleText = 'Виберіть мову / Select language';
  const continueButtonText = 'Continue';
  const isButtonDisabled = !selectedLanguage;

  console.log('LanguageSelectScreen: Render state - selectedLanguage:', selectedLanguage, 'isButtonDisabled:', isButtonDisabled);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.title}>{titleText}</Text>
          <Text style={styles.subtitle}>{subtitleText}</Text>
        </View>

        <View style={styles.languageGrid}>
          {LANGUAGE_OPTIONS.map((language, index) => {
            const isSelected = selectedLanguage === language.code;
            const cardStyle = isSelected
              ? [styles.languageCard, styles.languageCardSelected]
              : styles.languageCard;

            return (
              <TouchableOpacity
                key={index}
                style={cardStyle}
                onPress={() => handleLanguageSelect(language.code, language.enabled)}
                activeOpacity={0.7}
              >
                <Text style={styles.languageFlag}>{language.flag}</Text>
                <Text style={styles.languageLabel}>{language.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity
          style={[
            styles.continueButton,
            isButtonDisabled && styles.continueButtonDisabled,
          ]}
          onPress={handleContinue}
          disabled={isButtonDisabled}
          activeOpacity={0.8}
        >
          <Text style={styles.continueButtonText}>{continueButtonText}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    paddingTop: Platform.OS === 'android' ? 48 : 0,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
    marginTop: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 15,
    fontWeight: '400',
    color: '#94A3B8',
    textAlign: 'center',
  },
  languageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 32,
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
  continueButton: {
    backgroundColor: '#3B82F6',
    borderRadius: 14,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 4,
  },
  continueButtonDisabled: {
    backgroundColor: '#94A3B8',
    opacity: 0.5,
    shadowOpacity: 0,
    elevation: 0,
  },
  continueButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
