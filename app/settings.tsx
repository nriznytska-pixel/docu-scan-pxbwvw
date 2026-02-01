
import React from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { IconSymbol } from '@/components/IconSymbol';
import { colors } from '@/styles/commonStyles';
import { useLanguage, LANGUAGES } from '@/contexts/LanguageContext';

export default function SettingsScreen() {
  console.log('SettingsScreen: Component rendered');
  
  const router = useRouter();
  const { selectedLanguage, setSelectedLanguage } = useLanguage();

  const handleLanguageSelect = async (code: string) => {
    console.log('SettingsScreen: User selected language:', code);
    await setSelectedLanguage(code);
  };

  const screenTitle = '⚙️ Налаштування';
  const languageSelectorLabel = 'Мова перекладу:';

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: screenTitle,
          headerBackTitle: 'Назад',
          headerStyle: {
            backgroundColor: colors.backgroundAlt,
          },
          headerTintColor: colors.text,
        }}
      />
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>{languageSelectorLabel}</Text>
            <View style={styles.languageList}>
              {LANGUAGES.map((language) => {
                const isSelected = selectedLanguage === language.code;
                const languageDisplay = `${language.emoji} ${language.label}`;
                
                return (
                  <TouchableOpacity
                    key={language.code}
                    style={[
                      styles.languageOption,
                      isSelected && styles.languageOptionSelected,
                    ]}
                    onPress={() => handleLanguageSelect(language.code)}
                    activeOpacity={0.7}
                  >
                    <Text style={[
                      styles.languageText,
                      isSelected && styles.languageTextSelected,
                    ]}>
                      {languageDisplay}
                    </Text>
                    {isSelected && (
                      <IconSymbol
                        ios_icon_name="checkmark"
                        android_material_icon_name="check"
                        size={24}
                        color={colors.primary}
                      />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: Platform.OS === 'android' ? 48 : 0,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  section: {
    marginBottom: 24,
  },
  sectionLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  languageList: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  languageOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.card,
  },
  languageOptionSelected: {
    backgroundColor: colors.backgroundAlt,
  },
  languageText: {
    fontSize: 16,
    color: colors.text,
  },
  languageTextSelected: {
    fontWeight: '600',
    color: colors.primary,
  },
});
