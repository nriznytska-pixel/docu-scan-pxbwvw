
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
  emailPlaceholder: string;
  passwordPlaceholder: string;
  signInButton: string;
  noAccount: string;
  signUpLink: string;
  errorEmptyFields: string;
  errorInvalidCredentials: string;
  errorEmailNotConfirmed: string;
  errorGeneric: string;
}

const TEXTS: Record<string, LanguageTexts> = {
  uk: {
    emailPlaceholder: 'Email',
    passwordPlaceholder: 'Пароль',
    signInButton: 'Увійти',
    noAccount: 'Немає акаунту? ',
    signUpLink: 'Зареєструватися',
    errorEmptyFields: 'Будь ласка, заповніть всі поля',
    errorInvalidCredentials: 'Невірний email або пароль',
    errorEmailNotConfirmed: 'Email не підтверджено',
    errorGeneric: 'Помилка входу. Перевірте email та пароль.',
  },
  en: {
    emailPlaceholder: 'Email',
    passwordPlaceholder: 'Password',
    signInButton: 'Sign in',
    noAccount: 'No account? ',
    signUpLink: 'Sign up',
    errorEmptyFields: 'Please fill in all fields',
    errorInvalidCredentials: 'Invalid email or password',
    errorEmailNotConfirmed: 'Email not confirmed',
    errorGeneric: 'Login error. Check your email and password.',
  },
};

export default function LoginScreen() {
  console.log('LoginScreen: Component rendered');
  
  const router = useRouter();
  const { signIn } = useAuth();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [language, setLanguage] = useState<string>('uk');
  const [languageLabel, setLanguageLabel] = useState<string>('🇺🇦 Українська');

  useEffect(() => {
    loadLanguage();
  }, []);

  const loadLanguage = async () => {
    try {
      const savedLanguage = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
      console.log('LoginScreen: Loaded language from storage:', savedLanguage);
      
      if (savedLanguage) {
        setLanguage(savedLanguage);
        const label = savedLanguage === 'uk' ? '🇺🇦 Українська' : '🇬🇧 English';
        setLanguageLabel(label);
      }
    } catch (error) {
      console.error('LoginScreen: Error loading language:', error);
    }
  };

  const handleSignIn = async () => {
    console.log('LoginScreen: User tapped sign in button');
    console.log('LoginScreen: Email:', email);
    
    const texts = TEXTS[language] || TEXTS.uk;
    
    if (!email || !password) {
      console.log('LoginScreen: Validation failed - empty fields');
      setError(texts.errorEmptyFields);
      return;
    }

    setLoading(true);
    setError('');

    const { error: signInError } = await signIn(email, password);

    if (signInError) {
      console.error('LoginScreen: Sign in failed:', signInError.message);
      
      let errorMessage = texts.errorGeneric;
      
      if (signInError.message.includes('Invalid login credentials')) {
        errorMessage = texts.errorInvalidCredentials;
      } else if (signInError.message.includes('Email not confirmed')) {
        errorMessage = texts.errorEmailNotConfirmed;
      }
      
      setError(errorMessage);
      setLoading(false);
    } else {
      console.log('LoginScreen: Sign in successful, navigating to home');
    }
  };

  const goToSignup = () => {
    console.log('LoginScreen: User tapped sign up link');
    router.push('/signup');
  };

  const goToLanguageSelect = () => {
    console.log('LoginScreen: User tapped language badge');
    router.push('/language-select');
  };

  const texts = TEXTS[language] || TEXTS.uk;
  const titleText = '📬 DocuScan';
  const subtitleText = language === 'uk' 
    ? 'Ваш AI-помічник з офіційними листами'
    : 'Your AI assistant for official letters';

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
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
            <Text style={styles.subtitle}>{subtitleText}</Text>
            
            <TouchableOpacity
              style={styles.languageBadge}
              onPress={goToLanguageSelect}
              activeOpacity={0.7}
            >
              <Text style={styles.languageBadgeText}>{languageLabel}</Text>
            </TouchableOpacity>
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

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <TouchableOpacity
              style={[styles.signInButton, loading && styles.disabledButton]}
              onPress={handleSignIn}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.signInButtonText}>{texts.signInButton}</Text>
              )}
            </TouchableOpacity>

            <View style={styles.signupLinkContainer}>
              <Text style={styles.noAccountText}>{texts.noAccount}</Text>
              <TouchableOpacity onPress={goToSignup} disabled={loading}>
                <Text style={styles.signupLinkText}>{texts.signUpLink}</Text>
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
  subtitle: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  languageBadge: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginTop: 8,
  },
  languageBadgeText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
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
  signInButton: {
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
  signInButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  signupLinkContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 24,
  },
  noAccountText: {
    fontSize: 16,
    color: colors.textSecondary,
  },
  signupLinkText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.primary,
  },
});
