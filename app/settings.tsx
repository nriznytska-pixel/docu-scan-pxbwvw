
import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Platform,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { colors } from '@/styles/commonStyles';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { translate } from '@/constants/translations';

const LANGUAGE_OPTIONS = [
  { code: 'uk', label: '🇺🇦 UA Українська' },
  { code: 'ru', label: '🇷🇺 RU Русский' },
  { code: 'en', label: '🇬🇧 GB English' },
  { code: 'nl', label: '🇳🇱 NL Nederlands' },
  { code: 'pl', label: '🇵🇱 PL Polski' },
  { code: 'tr', label: '🇹🇷 TR Türkçe' },
  { code: 'de', label: '🇩🇪 DE Deutsch' },
  { code: 'fr', label: '🇫🇷 FR Français' },
  { code: 'es', label: '🇪🇸 ES Español' },
  { code: 'ar', label: '🇸🇦 SA العربية' },
  { code: 'ti', label: '🇪🇷 ER ትግርኛ' },
];

export default function SettingsScreen() {
  console.log('SettingsScreen: Component rendered');
  
  const router = useRouter();
  const { selectedLanguage, setSelectedLanguage } = useLanguage();
  const { signOut, user } = useAuth();
  
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  console.log('SettingsScreen: Current selectedLanguage:', selectedLanguage);
  console.log('SettingsScreen: Current user:', user?.email || 'null');

  const handleLanguageSelect = async (code: string) => {
    console.log('SettingsScreen: User tapped language button:', code);
    console.log('SettingsScreen: Previous language was:', selectedLanguage);
    
    await setSelectedLanguage(code);
    
    console.log('SettingsScreen: Language saved successfully:', code);
  };

  const handleLogoutPress = () => {
    console.log('SettingsScreen: User tapped logout button');
    setShowLogoutModal(true);
  };

  const confirmLogout = async () => {
    console.log('SettingsScreen: User confirmed logout');
    setShowLogoutModal(false);
    await signOut();
    console.log('SettingsScreen: Logout complete');
  };

  const cancelLogout = () => {
    console.log('SettingsScreen: User cancelled logout');
    setShowLogoutModal(false);
  };

  const backButtonText = translate('settings', 'back', selectedLanguage);
  const screenTitle = translate('settings', 'title', selectedLanguage);
  const languageSectionTitle = translate('settings', 'translationLanguage', selectedLanguage);
  const logoutButtonText = translate('settings', 'logout', selectedLanguage);
  const logoutModalTitle = translate('settings', 'logoutModalTitle', selectedLanguage);
  const logoutModalMessage = translate('settings', 'logoutModalMessage', selectedLanguage);
  const cancelButtonText = translate('settings', 'cancel', selectedLanguage);
  const confirmLogoutButtonText = translate('settings', 'logout', selectedLanguage);

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: screenTitle,
          headerBackTitle: backButtonText,
          headerStyle: {
            backgroundColor: colors.backgroundAlt,
          },
          headerTintColor: colors.text,
          headerShadowVisible: true,
        }}
      />
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <ScrollView 
          style={styles.scrollView} 
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={true}
        >
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{languageSectionTitle}</Text>
            
            <View style={styles.languageList}>
              {LANGUAGE_OPTIONS.map((language) => {
                const isSelected = selectedLanguage === language.code;
                
                return (
                  <TouchableOpacity
                    key={language.code}
                    style={[
                      styles.languageButton,
                      isSelected ? styles.languageButtonSelected : styles.languageButtonUnselected,
                    ]}
                    onPress={() => handleLanguageSelect(language.code)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.languageButtonText,
                        isSelected ? styles.languageButtonTextSelected : styles.languageButtonTextUnselected,
                      ]}
                    >
                      {language.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={styles.logoutSection}>
            <TouchableOpacity
              style={styles.logoutButton}
              onPress={handleLogoutPress}
              activeOpacity={0.8}
            >
              <Text style={styles.logoutButtonText}>{logoutButtonText}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>

        <Modal
          visible={showLogoutModal}
          animationType="fade"
          transparent={true}
          onRequestClose={cancelLogout}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>{logoutModalTitle}</Text>
              <Text style={styles.modalMessage}>{logoutModalMessage}</Text>
              <View style={styles.modalButtons}>
                <TouchableOpacity 
                  style={styles.modalCancelButton} 
                  onPress={cancelLogout}
                  activeOpacity={0.7}
                >
                  <Text style={styles.modalCancelButtonText}>{cancelButtonText}</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={styles.modalConfirmButton} 
                  onPress={confirmLogout}
                  activeOpacity={0.7}
                >
                  <Text style={styles.modalConfirmButtonText}>{confirmLogoutButtonText}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
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
    paddingBottom: 120,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 16,
  },
  languageList: {
    gap: 12,
  },
  languageButton: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 12,
    minHeight: 56,
    justifyContent: 'center',
  },
  languageButtonSelected: {
    backgroundColor: '#007AFF',
  },
  languageButtonUnselected: {
    backgroundColor: '#E5E5EA',
  },
  languageButtonText: {
    fontSize: 17,
    fontWeight: '600',
  },
  languageButtonTextSelected: {
    color: '#FFFFFF',
  },
  languageButtonTextUnselected: {
    color: '#000000',
  },
  logoutSection: {
    marginTop: 32,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  logoutButton: {
    backgroundColor: '#FF3B30',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: colors.backgroundAlt,
    borderRadius: 20,
    padding: 28,
    width: '100%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 12,
    textAlign: 'center',
  },
  modalMessage: {
    fontSize: 16,
    color: colors.textSecondary,
    marginBottom: 28,
    textAlign: 'center',
    lineHeight: 22,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  modalCancelButton: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 10,
    backgroundColor: colors.background,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalCancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  modalConfirmButton: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 10,
    backgroundColor: '#FF3B30',
    alignItems: 'center',
  },
  modalConfirmButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
