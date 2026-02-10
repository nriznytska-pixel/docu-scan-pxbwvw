
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
import { colors } from '@/styles/commonStyles';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { IconSymbol } from '@/components/IconSymbol';

interface LanguageOption {
  code: string;
  label: string;
  flag: string;
  enabled: boolean;
  comingSoonText?: string;
}

const LANGUAGE_OPTIONS: LanguageOption[] = [
  { code: 'uk', label: 'Українська', flag: '🇺🇦', enabled: true },
  { code: 'en', label: 'English', flag: '🇬🇧', enabled: true },
  { code: 'ar', label: 'العربية', flag: '🇸🇦', enabled: false, comingSoonText: 'Binnenkort beschikbaar' },
  { code: 'tr', label: 'Türkçe', flag: '🇹🇷', enabled: false, comingSoonText: 'Binnenkort beschikbaar' },
  { code: 'ti', label: 'ትግርኛ', flag: '🇪🇷', enabled: false, comingSoonText: 'Binnenkort beschikbaar' },
  { code: 'pl', label: 'Polski', flag: '🇵🇱', enabled: false, comingSoonText: 'Binnenkort beschikbaar' },
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

  const titleText = '📬 DocuScan';
  const subtitleLine1 = 'AI-помічник з офіційними листами';
  const subtitleLine2 = 'Your AI assistant for official letters';
  const chooseLanguageText = 'Оберіть мову / Choose language';
  const continueButtonText = 'Продовжити / Continue';
  const isButtonDisabled = !selectedLanguage;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.title}>{titleText}</Text>
          <Text style={styles.subtitleLine1}>{subtitleLine1}</Text>
          <Text style={styles.subtitleLine2}>{subtitleLine2}</Text>
        </View>

        <View style={styles.languageSelectorHeader}>
          <IconSymbol
            ios_icon_name="globe"
            android_material_icon_name="language"
            size={20}
            color={colors.textSecondary}
          />
          <Text style={styles.chooseLanguageText}>{chooseLanguageText}</Text>
        </View>

        <View style={styles.languageList}>
          {LANGUAGE_OPTIONS.map((language, index) => {
            const isSelected = selectedLanguage === language.code;
            const cardStyle = language.enabled
              ? isSelected
                ? styles.languageCardSelected
                : styles.languageCard
              : styles.languageCardDisabled;

            return (
              <TouchableOpacity
                key={index}
                style={cardStyle}
                onPress={() => handleLanguageSelect(language.code, language.enabled)}
                disabled={!language.enabled}
                activeOpacity={0.7}
              >
                <View style={styles.languageCardContent}>
                  <Text style={styles.languageFlag}>{language.flag}</Text>
                  <View style={styles.languageTextContainer}>
                    <Text
                      style={
                        language.enabled
                          ? styles.languageLabel
                          : styles.languageLabelDisabled
                      }
                    >
                      {language.label}
                    </Text>
                    {!language.enabled && language.comingSoonText && (
                      <Text style={styles.comingSoonText}>
                        {language.comingSoonText}
                      </Text>
                    )}
                  </View>
                  {isSelected && language.enabled && (
                    <IconSymbol
                      ios_icon_name="checkmark.circle.fill"
                      android_material_icon_name="check-circle"
                      size={24}
                      color={colors.primary}
                    />
                  )}
                </View>
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
    backgroundColor: colors.background,
    paddingTop: Platform.OS === 'android' ? 48 : 0,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
    marginTop: 20,
  },
  title: {
    fontSize: 36,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 16,
  },
  subtitleLine1: {
    fontSize: 16,
    color: colors.text,
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitleLine2: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  languageSelectorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    gap: 8,
  },
  chooseLanguageText: {
    fontSize: 14,
    color: colors.textSecondary,
    marginLeft: 8,
  },
  languageList: {
    marginBottom: 24,
  },
  languageCard: {
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  languageCardSelected: {
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.primary,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    elevation: 2,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  languageCardDisabled: {
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    opacity: 0.5,
  },
  languageCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  languageFlag: {
    fontSize: 32,
    marginRight: 16,
  },
  languageTextContainer: {
    flex: 1,
  },
  languageLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  languageLabelDisabled: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  comingSoonText: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  continueButton: {
    backgroundColor: colors.primary,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  continueButtonDisabled: {
    backgroundColor: colors.textSecondary,
    opacity: 0.5,
  },
  continueButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
