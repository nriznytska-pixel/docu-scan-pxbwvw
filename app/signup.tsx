
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
import { colors } from '@/styles/commonStyles';
import { useAuth } from '@/contexts/AuthContext';
import AsyncStorage from '@react-native-async-storage/async-storage';

const LANGUAGE_STORAGE_KEY = 'selectedLanguage';

interface LanguageTexts {
  title: string;
  emailPlaceholder: string;
  passwordPlaceholder: string;
  confirmPasswordPlaceholder: string;
  signUpButton: string;
  hasAccount: string;
  signInLink: string;
  errorEmptyFields: string;
  errorPasswordTooShort: string;
  errorPasswordMismatch: string;
  errorEmailExists: string;
  errorInvalidEmail: string;
  errorGeneric: string;
  backButton: string;
}

const TEXTS: Record<string, LanguageTexts> = {
  uk: {
    title: '📬 Реєстрація',
    emailPlaceholder: 'Email',
    passwordPlaceholder: 'Пароль (мінімум 6 символів)',
    confirmPasswordPlaceholder: 'Підтвердіть пароль',
    signUpButton: 'Зареєструватися',
    hasAccount: 'Вже є акаунт? ',
    signInLink: 'Увійти',
    errorEmptyFields: 'Будь ласка, заповніть всі поля',
    errorPasswordTooShort: 'Пароль повинен містити мінімум 6 символів',
    errorPasswordMismatch: 'Паролі не співпадають',
    errorEmailExists: 'Цей email вже зареєстрований',
    errorInvalidEmail: 'Невірний формат email',
    errorGeneric: 'Помилка реєстрації. Спробуйте ще раз.',
    backButton: '← Назад',
  },
  en: {
    title: '📬 Sign Up',
    emailPlaceholder: 'Email',
    passwordPlaceholder: 'Password (minimum 6 characters)',
    confirmPasswordPlaceholder: 'Confirm password',
    signUpButton: 'Sign up',
    hasAccount: 'Already have an account? ',
    signInLink: 'Sign in',
    errorEmptyFields: 'Please fill in all fields',
    errorPasswordTooShort: 'Password must be at least 6 characters',
    errorPasswordMismatch: 'Passwords do not match',
    errorEmailExists: 'This email is already registered',
    errorInvalidEmail: 'Invalid email format',
    errorGeneric: 'Registration error. Please try again.',
    backButton: '← Back',
  },
};

export default function SignupScreen() {
  console.log('SignupScreen: Component rendered');
  
  const router = useRouter();
  const { signUp } = useAuth();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [language, setLanguage] = useState<string>('uk');

  useEffect(() => {
    loadLanguage();
  }, []);

  const loadLanguage = async () => {
    try {
      const savedLanguage = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
      console.log('SignupScreen: Loaded language from storage:', savedLanguage);
      
      if (savedLanguage) {
        setLanguage(savedLanguage);
      }
    } catch (error) {
      console.error('SignupScreen: Error loading language:', error);
    }
  };

  const handleSignUp = async () => {
    console.log('SignupScreen: User tapped sign up button');
    console.log('SignupScreen: Email:', email);
    
    const texts = TEXTS[language] || TEXTS.uk;
    
    if (!email || !password || !confirmPassword) {
      console.log('SignupScreen: Validation failed - empty fields');
      setError(texts.errorEmptyFields);
      return;
    }

    if (password.length < 6) {
      console.log('SignupScreen: Validation failed - password too short');
      setError(texts.errorPasswordTooShort);
      return;
    }

    if (password !== confirmPassword) {
      console.log('SignupScreen: Validation failed - passwords do not match');
      setError(texts.errorPasswordMismatch);
      return;
    }

    setLoading(true);
    setError('');

    const { error: signUpError } = await signUp(email, password);

    if (signUpError) {
      console.error('SignupScreen: Sign up failed:', signUpError.message);
      
      let errorMessage = texts.errorGeneric;
      
      if (signUpError.message.includes('already registered')) {
        errorMessage = texts.errorEmailExists;
      } else if (signUpError.message.includes('Invalid email')) {
        errorMessage = texts.errorInvalidEmail;
      }
      
      setError(errorMessage);
      setLoading(false);
    } else {
      console.log('SignupScreen: Sign up successful, navigating to home');
    }
  };

  const goToLogin = () => {
    console.log('SignupScreen: User tapped back button / sign in link');
    router.back();
  };

  const texts = TEXTS[language] || TEXTS.uk;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <TouchableOpacity 
        style={styles.backButton} 
        onPress={goToLogin}
        disabled={loading}
        activeOpacity={0.7}
      >
        <Text style={styles.backButtonText}>{texts.backButton}</Text>
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
            <Text style={styles.title}>{texts.title}</Text>
          </View>

          <View style={styles.form}>
            <TextInput
              style={styles.input}
              placeholder={texts.emailPlaceholder}
              placeholderTextColor={colors.textSecondary}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              editable={!loading}
            />

            <TextInput
              style={styles.input}
              placeholder={texts.passwordPlaceholder}
              placeholderTextColor={colors.textSecondary}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="password"
              editable={!loading}
            />

            <TextInput
              style={styles.input}
              placeholder={texts.confirmPasswordPlaceholder}
              placeholderTextColor={colors.textSecondary}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="password"
              editable={!loading}
            />

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
                <Text style={styles.signUpButtonText}>{texts.signUpButton}</Text>
              )}
            </TouchableOpacity>

            <View style={styles.loginLinkContainer}>
              <Text style={styles.hasAccountText}>{texts.hasAccount}</Text>
              <TouchableOpacity onPress={goToLogin} disabled={loading}>
                <Text style={styles.loginLinkText}>{texts.signInLink}</Text>
              </TouchableOpacity>
            </View>
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
});
