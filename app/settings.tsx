
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
import { IconSymbol } from '@/components/IconSymbol';
import { colors } from '@/styles/commonStyles';
import { useLanguage, LANGUAGES } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';

export default function SettingsScreen() {
  console.log('SettingsScreen: Component rendered');
  
  const router = useRouter();
  const { selectedLanguage, setSelectedLanguage } = useLanguage();
  const { signOut, user } = useAuth();
  
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  console.log('SettingsScreen: 🔍 Current selectedLanguage:', selectedLanguage);
  console.log('SettingsScreen: Current user:', user?.email || 'null');

  const handleLanguageSelect = async (code: string) => {
    console.log('SettingsScreen: 🔍 CRITICAL - User selected language:', code);
    console.log('SettingsScreen: 🔍 CRITICAL - Code type:', typeof code);
    console.log('SettingsScreen: 🔍 CRITICAL - Previous language was:', selectedLanguage);
    
    await setSelectedLanguage(code);
    
    console.log('SettingsScreen: ✅ setSelectedLanguage call completed');
  };

  const handleLogoutPress = () => {
    console.log('SettingsScreen: User tapped logout button');
    setShowLogoutModal(true);
  };

  const confirmLogout = async () => {
    console.log('SettingsScreen: User confirmed logout');
    setShowLogoutModal(false);
    await signOut();
    console.log('SettingsScreen: Logout complete, navigation will happen via AuthContext');
  };

  const cancelLogout = () => {
    console.log('SettingsScreen: User cancelled logout');
    setShowLogoutModal(false);
  };

  const screenTitle = '⚙️ Налаштування';
  const languageSelectorLabel = 'Мова перекладу:';
  const logoutButtonText = 'Вийти';
  const logoutModalTitle = 'Вийти з акаунту?';
  const logoutModalMessage = 'Ви впевнені, що хочете вийти?';
  const cancelButtonText = 'Скасувати';
  const confirmLogoutButtonText = 'Вийти';

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
          headerShadowVisible: true,
        }}
      />
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <ScrollView 
          style={styles.scrollView} 
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Language Selector Section */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>{languageSelectorLabel}</Text>
            <Text style={styles.sectionDescription}>
              Оберіть мову для перекладу офіційних листів
            </Text>
            <View style={styles.languageList}>
              {LANGUAGES.map((language, index) => {
                const isSelected = selectedLanguage === language.code;
                const languageDisplay = `${language.emoji} ${language.label}`;
                const isLastItem = index === LANGUAGES.length - 1;
                
                console.log(`SettingsScreen: Language ${language.code} - isSelected: ${isSelected}`);
                
                return (
                  <TouchableOpacity
                    key={language.code}
                    style={[
                      styles.languageOption,
                      isSelected && styles.languageOptionSelected,
                      isLastItem && styles.languageOptionLast,
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
                      <View style={styles.checkmarkContainer}>
                        <IconSymbol
                          ios_icon_name="checkmark.circle.fill"
                          android_material_icon_name="check-circle"
                          size={24}
                          color={colors.primary}
                        />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Spacer to push logout button to bottom */}
          <View style={styles.spacer} />

          {/* Logout Section */}
          <View style={styles.logoutSection}>
            <TouchableOpacity
              style={styles.logoutButton}
              onPress={handleLogoutPress}
              activeOpacity={0.8}
            >
              <IconSymbol
                ios_icon_name="arrow.right.square"
                android_material_icon_name="logout"
                size={24}
                color="#FFFFFF"
              />
              <Text style={styles.logoutButtonText}>{logoutButtonText}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>

        {/* Logout Confirmation Modal */}
        <Modal
          visible={showLogoutModal}
          animationType="fade"
          transparent={true}
          onRequestClose={cancelLogout}
        >
          <View style={styles.logoutModalOverlay}>
            <View style={styles.logoutModalContent}>
              <Text style={styles.logoutModalTitle}>{logoutModalTitle}</Text>
              <Text style={styles.logoutModalMessage}>{logoutModalMessage}</Text>
              <View style={styles.logoutModalButtons}>
                <TouchableOpacity style={styles.cancelButton} onPress={cancelLogout}>
                  <Text style={styles.cancelButtonText}>{cancelButtonText}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.confirmLogoutButton} onPress={confirmLogout}>
                  <Text style={styles.confirmLogoutButtonText}>{confirmLogoutButtonText}</Text>
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
    paddingBottom: 40,
  },
  section: {
    marginBottom: 24,
  },
  sectionLabel: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
  },
  sectionDescription: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 16,
    lineHeight: 20,
  },
  languageList: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  languageOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.card,
    minHeight: 56,
  },
  languageOptionLast: {
    borderBottomWidth: 0,
  },
  languageOptionSelected: {
    backgroundColor: colors.backgroundAlt,
  },
  languageText: {
    fontSize: 17,
    color: colors.text,
    flex: 1,
  },
  languageTextSelected: {
    fontWeight: '600',
    color: colors.primary,
  },
  checkmarkContainer: {
    marginLeft: 12,
  },
  spacer: {
    flex: 1,
    minHeight: 40,
  },
  logoutSection: {
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.error,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  logoutButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    marginLeft: 12,
  },
  logoutModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  logoutModalContent: {
    backgroundColor: colors.backgroundAlt,
    borderRadius: 20,
    padding: 28,
    width: '100%',
    maxWidth: 400,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  logoutModalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 12,
    textAlign: 'center',
  },
  logoutModalMessage: {
    fontSize: 16,
    color: colors.textSecondary,
    marginBottom: 28,
    textAlign: 'center',
    lineHeight: 22,
  },
  logoutModalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 10,
    backgroundColor: colors.background,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  confirmLogoutButton: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 10,
    backgroundColor: colors.error,
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  confirmLogoutButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
