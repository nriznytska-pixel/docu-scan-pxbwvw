import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface LanguageOption {
  code: string;
  label: string;
  emoji: string;
}

export const LANGUAGES: LanguageOption[] = [
  { code: 'uk', label: 'Українська', emoji: '🇺🇦' },
  { code: 'ru', label: 'Русский', emoji: '🇷🇺' },
  { code: 'en', label: 'English', emoji: '🇬🇧' },
  { code: 'nl', label: 'Nederlands', emoji: '🇳🇱' },
  { code: 'pl', label: 'Polski', emoji: '🇵🇱' },
  { code: 'tr', label: 'Türkçe', emoji: '🇹🇷' },
  { code: 'de', label: 'Deutsch', emoji: '🇩🇪' },
  { code: 'fr', label: 'Français', emoji: '🇫🇷' },
  { code: 'es', label: 'Español', emoji: '🇪🇸' },
  { code: 'ar', label: 'العربية', emoji: '🇸🇦' },
  { code: 'ti', label: 'ትግርኛ', emoji: '🇪🇷' },
];

const LANGUAGE_STORAGE_KEY = 'selectedLanguage';

interface LanguageContextType {
  selectedLanguage: string;
  setSelectedLanguage: (code: string) => Promise<void>;
  getLanguageLabel: (code: string) => string;
  refreshLanguage: () => Promise<void>;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [selectedLanguage, setSelectedLanguageState] = useState<string>('uk');

  useEffect(() => {
    console.log('LanguageContext: Initializing - Loading saved language from storage');
    loadSavedLanguage();
  }, []);

  const loadSavedLanguage = async () => {
    try {
      const savedLanguage = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
      console.log('LanguageContext: Raw value from AsyncStorage:', savedLanguage);

      if (savedLanguage) {
        const validCodes = LANGUAGES.map(lang => lang.code);
        if (validCodes.includes(savedLanguage)) {
          console.log('LanguageContext: Valid language loaded from storage:', savedLanguage);
          setSelectedLanguageState(savedLanguage);
        } else {
          console.error('LanguageContext: Invalid language code in storage:', savedLanguage);
          await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, 'uk');
          setSelectedLanguageState('uk');
        }
      } else {
        console.log('LanguageContext: No saved language found, setting default: uk');
        await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, 'uk');
        setSelectedLanguageState('uk');
      }
    } catch (error) {
      console.error('LanguageContext: Error loading language from storage:', error);
      setSelectedLanguageState('uk');
    }
  };

  const refreshLanguage = async () => {
    console.log('LanguageContext: Refreshing language from storage');
    try {
      const savedLanguage = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
      if (savedLanguage) {
        const validCodes = LANGUAGES.map(lang => lang.code);
        if (validCodes.includes(savedLanguage)) {
          setSelectedLanguageState(savedLanguage);
        }
      }
    } catch (error) {
      console.error('LanguageContext: Error refreshing language:', error);
    }
  };

  const setSelectedLanguage = async (code: string) => {
    console.log('LanguageContext: setSelectedLanguage called with:', code);

    const validCodes = LANGUAGES.map(lang => lang.code);
    if (!validCodes.includes(code)) {
      console.error('LanguageContext: Invalid language code:', code);
      return;
    }

    try {
      await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, code);
      setSelectedLanguageState(code);
      console.log('LanguageContext: Language saved successfully:', code);
    } catch (error) {
      console.error('LanguageContext: Error saving language to storage:', error);
    }
  };

  const getLanguageLabel = (code: string): string => {
    const language = LANGUAGES.find(lang => lang.code === code);
    return language ? `${language.emoji} ${language.label}` : code;
  };

  return (
    <LanguageContext.Provider
      value={{ selectedLanguage, setSelectedLanguage, getLanguageLabel, refreshLanguage }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
