
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
  { code: 'pl', label: 'Polski', emoji: '🇵🇱' },
  { code: 'tr', label: 'Türkçe', emoji: '🇹🇷' },
  { code: 'de', label: 'Deutsch', emoji: '🇩🇪' },
  { code: 'fr', label: 'Français', emoji: '🇫🇷' },
  { code: 'es', label: 'Español', emoji: '🇪🇸' },
  { code: 'ar', label: 'العربية', emoji: '🇸🇦' },
];

const LANGUAGE_STORAGE_KEY = '@app_language';

interface LanguageContextType {
  selectedLanguage: string;
  setSelectedLanguage: (code: string) => Promise<void>;
  getLanguageLabel: (code: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [selectedLanguage, setSelectedLanguageState] = useState<string>('uk');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    console.log('LanguageContext: Loading saved language from storage');
    loadSavedLanguage();
  }, []);

  const loadSavedLanguage = async () => {
    try {
      const savedLanguage = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
      if (savedLanguage) {
        console.log('LanguageContext: Loaded language from storage:', savedLanguage);
        setSelectedLanguageState(savedLanguage);
      } else {
        console.log('LanguageContext: No saved language, using default: uk');
      }
    } catch (error) {
      console.error('LanguageContext: Error loading language from storage:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const setSelectedLanguage = async (code: string) => {
    console.log('LanguageContext: Setting language to:', code);
    try {
      await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, code);
      setSelectedLanguageState(code);
      console.log('LanguageContext: Language saved successfully');
    } catch (error) {
      console.error('LanguageContext: Error saving language to storage:', error);
    }
  };

  const getLanguageLabel = (code: string): string => {
    const language = LANGUAGES.find(lang => lang.code === code);
    const label = language ? `${language.emoji} ${language.label}` : code;
    return label;
  };

  if (isLoading) {
    return null;
  }

  return (
    <LanguageContext.Provider value={{ selectedLanguage, setSelectedLanguage, getLanguageLabel }}>
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
