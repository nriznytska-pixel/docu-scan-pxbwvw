
import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/styles/commonStyles';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { translate } from '@/constants/translations';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function SignupScreen() {
  console.log('SignupScreen: Component rendered');
  
  const router = useRouter();
  const { signUp } = useAuth();
  const { selectedLanguage, refreshLanguage } = useLanguage();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [confirmPasswordVisible, setConfirmPasswordVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Refresh language from storage when component mounts
  useEffect(() => {
    console.log('SignupScreen: Refreshing language from storage');
    refreshLanguage();
  }, [refreshLanguage]);

  console.log('SignupScreen: Current language:', selectedLanguage);

  const handleSignUp = async () => {
    console.log('SignupScreen: User tapped sign up button');
    console.log('SignupScreen: Email:', email);
    
    if (!email || !password || !confirmPassword) {
      console.log('SignupScreen: Validation failed - empty fields');
      setError('Please fill in all fields');
      return;
    }

    if (password.length < 6) {
      console.log('SignupScreen: Validation failed - password too short');
      setError('Password must be at least 6 characters');
      return;
    }

    if (password !== confirmPassword) {
      console.log('SignupScreen: Validation failed - passwords do not match');
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    setError('');

    const { error: signUpError } = await signUp(email, password);

    if (signUpError) {
      console.error('SignupScreen: Sign up failed:', signUpError.message);
      setError('Registration error. Please try again.');
      setLoading(false);
    } else {
      console.log('SignupScreen: Sign up successful, navigating to home');
    }
  };

  const goToLogin = () => {
    console.log('SignupScreen: User tapped back button / sign in link');
    router.replace('/login');
  };

  const handleContinueAsGuest = async () => {
    console.log('SignupScreen: User tapped continue without account');
    try {
      await AsyncStorage.setItem('is_guest', 'true');
      console.log('SignupScreen: Guest flag set in AsyncStorage');
    } catch {}
    router.replace('/(tabs)/(home)');
  };

  const titleText = translate('signup', 'title', selectedLanguage);
  const emailPlaceholder = translate('signup', 'email', selectedLanguage);
  const passwordPlaceholder = translate('signup', 'password', selectedLanguage);
  const confirmPasswordPlaceholder = translate('signup', 'confirmPassword', selectedLanguage);
  const signUpButtonText = translate('signup', 'signUpButton', selectedLanguage);
  const alreadyAccountText = translate('signup', 'alreadyAccount', selectedLanguage);
  const signInLinkText = translate('signup', 'signIn', selectedLanguage);
  const backButtonText = translate('signup', 'back', selectedLanguage);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <TouchableOpacity 
        style={styles.backButton} 
        onPress={goToLogin}
        disabled={loading}
        activeOpacity={0.7}
      >
        <Text style={styles.backButtonText}>{backButtonText}</Text>
      </TouchableOpacity>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Text style={styles.title}>{titleText}</Text>
          </View>

          <View style={styles.form}>
            <TextInput
              style={styles.input}
              placeholder={emailPlaceholder}
              placeholderTextColor={colors.textSecondary}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              editable={!loading}
            />

            <View style={styles.passwordWrapper}>
              <TextInput
                style={styles.passwordInput}
                placeholder={passwordPlaceholder}
                placeholderTextColor={colors.textSecondary}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!passwordVisible}
                autoCapitalize="none"
                autoComplete="password"
                editable={!loading}
              />
              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => {
                  console.log('SignupScreen: Password visibility toggled to', !passwordVisible ? 'visible' : 'hidden');
                  setPasswordVisible(!passwordVisible);
                }}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={passwordVisible ? 'eye' : 'eye-off'}
                  size={22}
                  color={colors.textSecondary}
                />
              </TouchableOpacity>
            </View>

            <View style={styles.passwordWrapper}>
              <TextInput
                style={styles.passwordInput}
                placeholder={confirmPasswordPlaceholder}
                placeholderTextColor={colors.textSecondary}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!confirmPasswordVisible}
                autoCapitalize="none"
                autoComplete="password"
                editable={!loading}
              />
              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => {
                  console.log('SignupScreen: Confirm password visibility toggled to', !confirmPasswordVisible ? 'visible' : 'hidden');
                  setConfirmPasswordVisible(!confirmPasswordVisible);
                }}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={confirmPasswordVisible ? 'eye' : 'eye-off'}
                  size={22}
                  color={colors.textSecondary}
                />
              </TouchableOpacity>
            </View>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <TouchableOpacity
              style={[styles.signUpButton, loading && styles.disabledButton]}
              onPress={handleSignUp}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.signUpButtonText}>{signUpButtonText}</Text>
              )}
            </TouchableOpacity>

            <View style={styles.loginLinkContainer}>
              <Text style={styles.hasAccountText}>{alreadyAccountText}</Text>
              <TouchableOpacity onPress={goToLogin} disabled={loading}>
                <Text style={styles.loginLinkText}>{signInLinkText}</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.guestButton} onPress={handleContinueAsGuest} activeOpacity={0.7}>
              <Text style={styles.guestButtonText}>Continue without account</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: Platform.OS === 'android' ? 48 : 0,
  },
  backButton: {
    position: 'absolute',
    top: Platform.OS === 'android' ? 60 : 12,
    left: 20,
    zIndex: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.primary,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 48,
  },
  title: {
    fontSize: 36,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 8,
  },
  form: {
    width: '100%',
  },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 16,
    fontSize: 16,
    color: colors.text,
    marginBottom: 16,
  },
  passwordWrapper: {
    position: 'relative',
    marginBottom: 16,
  },
  passwordInput: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 16,
    paddingRight: 52,
    fontSize: 16,
    color: colors.text,
  },
  eyeButton: {
    position: 'absolute',
    right: 14,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 4,
  },
  errorText: {
    color: colors.error,
    fontSize: 14,
    marginBottom: 16,
    textAlign: 'center',
  },
  signUpButton: {
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
  disabledButton: {
    opacity: 0.6,
  },
  signUpButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  loginLinkContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 24,
  },
  hasAccountText: {
    fontSize: 16,
    color: colors.textSecondary,
  },
  loginLinkText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.primary,
  },
  guestButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  guestButtonText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#FFFFFF',
  },
});
