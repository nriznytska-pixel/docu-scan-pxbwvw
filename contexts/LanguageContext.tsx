
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
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    console.log('LanguageContext: 🔄 Initializing - Loading saved language from storage');
    loadSavedLanguage();
  }, []);

  const loadSavedLanguage = async () => {
    try {
      const savedLanguage = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
      console.log('LanguageContext: 🔍 Raw value from AsyncStorage:', savedLanguage);
      
      if (savedLanguage) {
        const validCodes = LANGUAGES.map(lang => lang.code);
        if (validCodes.includes(savedLanguage)) {
          console.log('LanguageContext: ✅ Valid language loaded from storage:', savedLanguage);
          setSelectedLanguageState(savedLanguage);
        } else {
          console.error('LanguageContext: ⚠️ Invalid language code in storage:', savedLanguage);
          console.log('LanguageContext: Resetting to default: uk');
          await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, 'uk');
          setSelectedLanguageState('uk');
        }
      } else {
        console.log('LanguageContext: No saved language found, setting default: uk');
        await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, 'uk');
        setSelectedLanguageState('uk');
      }
    } catch (error) {
      console.error('LanguageContext: ❌ Error loading language from storage:', error);
      setSelectedLanguageState('uk');
    } finally {
      setIsLoading(false);
      console.log('LanguageContext: ✅ Initialization complete');
    }
  };

  const refreshLanguage = async () => {
    console.log('LanguageContext: 🔄 Refreshing language from storage');
    try {
      const savedLanguage = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
      console.log('LanguageContext: 🔍 Refreshed value from AsyncStorage:', savedLanguage);
      
      if (savedLanguage) {
        const validCodes = LANGUAGES.map(lang => lang.code);
        if (validCodes.includes(savedLanguage)) {
          console.log('LanguageContext: ✅ Updating state to refreshed language:', savedLanguage);
          setSelectedLanguageState(savedLanguage);
        }
      }
    } catch (error) {
      console.error('LanguageContext: ❌ Error refreshing language:', error);
    }
  };

  const setSelectedLanguage = async (code: string) => {
    console.log('LanguageContext: 🔍 CRITICAL - setSelectedLanguage called with:', code);
    console.log('LanguageContext: 🔍 CRITICAL - Code type:', typeof code);
    
    const validCodes = LANGUAGES.map(lang => lang.code);
    if (!validCodes.includes(code)) {
      console.error('LanguageContext: ⚠️ WARNING - Invalid language code:', code);
      console.error('LanguageContext: Valid codes are:', validCodes.join(', '));
      return;
    }
    
    try {
      console.log('LanguageContext: 💾 Saving to AsyncStorage:', code);
      await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, code);
      
      console.log('LanguageContext: 🔄 Updating state to:', code);
      setSelectedLanguageState(code);
      
      const verification = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
      console.log('LanguageContext: ✅ Verification - Language in storage:', verification);
      
      if (verification !== code) {
        console.error('LanguageContext: ⚠️ WARNING - Verification failed!');
        console.error('LanguageContext: Expected:', code, 'Got:', verification);
      } else {
        console.log('LanguageContext: ✅ Language saved and verified successfully');
      }
    } catch (error) {
      console.error('LanguageContext: ❌ Error saving language to storage:', error);
    }
  };

  const getLanguageLabel = (code: string): string => {
    const language = LANGUAGES.find(lang => lang.code === code);
    const label = language ? `${language.emoji} ${language.label}` : code;
    return label;
  };

  useEffect(() => {
    if (!isLoading) {
      console.log('LanguageContext: 🔍 Current selectedLanguage state:', selectedLanguage);
    }
  }, [selectedLanguage, isLoading]);

  console.log('LanguageContext: ✅ Provider rendering with language:', selectedLanguage);

  return (
    <LanguageContext.Provider value={{ selectedLanguage, setSelectedLanguage, getLanguageLabel, refreshLanguage }}>
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
