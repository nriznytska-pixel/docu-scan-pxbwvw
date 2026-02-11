
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

export default function SettingsScreen() {
  console.log('SettingsScreen: Component rendered');
  
  const router = useRouter();
  const { selectedLanguage } = useLanguage();
  const { signOut, user } = useAuth();
  
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  console.log('SettingsScreen: Current selectedLanguage:', selectedLanguage);
  console.log('SettingsScreen: Current user:', user?.email || 'null');

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
  logoutSection: {
    marginTop: 32,
    paddingTop: 24,
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
