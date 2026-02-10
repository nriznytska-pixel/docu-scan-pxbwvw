
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
import { useLanguage } from '@/contexts/LanguageContext';
import { translate } from '@/constants/translations';

export default function LoginScreen() {
  console.log('LoginScreen: Component rendered');
  
  const router = useRouter();
  const { signIn, user } = useAuth();
  const { selectedLanguage, refreshLanguage } = useLanguage();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Refresh language from storage when component mounts
  useEffect(() => {
    console.log('LoginScreen: Refreshing language from storage');
    refreshLanguage();
  }, []);

  // If user is already logged in, they'll be redirected by _layout.tsx
  useEffect(() => {
    if (user) {
      console.log('LoginScreen: User already logged in, waiting for redirect');
    }
  }, [user]);

  console.log('LoginScreen: Current language:', selectedLanguage);

  const handleSignIn = async () => {
    console.log('LoginScreen: User tapped sign in button');
    console.log('LoginScreen: Email:', email);
    
    if (!email || !password) {
      console.log('LoginScreen: Validation failed - empty fields');
      const errorMsg = translate('login', 'emptyFields', selectedLanguage) || 'Please fill in all fields';
      setError(errorMsg);
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      console.log('LoginScreen: Validation failed - invalid email format');
      const errorMsg = translate('login', 'invalidEmail', selectedLanguage) || 'Please enter a valid email address';
      setError(errorMsg);
      return;
    }

    setLoading(true);
    setError('');
    console.log('LoginScreen: Starting sign in process...');

    try {
      const { error: signInError } = await signIn(email, password);

      if (signInError) {
        console.error('LoginScreen: Sign in failed:', signInError.message);
        
        // Provide user-friendly error messages
        let errorMsg = 'Invalid email or password';
        if (signInError.message.includes('Invalid login credentials')) {
          errorMsg = translate('login', 'invalidCredentials', selectedLanguage) || 'Invalid email or password';
        } else if (signInError.message.includes('Email not confirmed')) {
          errorMsg = translate('login', 'emailNotConfirmed', selectedLanguage) || 'Please confirm your email address';
        } else if (signInError.message.includes('network')) {
          errorMsg = translate('login', 'networkError', selectedLanguage) || 'Network error. Please check your connection';
        }
        
        setError(errorMsg);
        setLoading(false);
      } else {
        console.log('LoginScreen: Sign in successful! User will be redirected by _layout.tsx');
        // Don't set loading to false here - let the redirect happen
        // The loading state will keep the button disabled during redirect
      }
    } catch (err: any) {
      console.error('LoginScreen: Unexpected error during sign in:', err);
      const errorMsg = translate('login', 'unexpectedError', selectedLanguage) || 'An unexpected error occurred. Please try again.';
      setError(errorMsg);
      setLoading(false);
    }
  };

  const goToSignup = () => {
    console.log('LoginScreen: User tapped sign up link');
    router.push('/signup');
  };

  const goToLanguageSelect = () => {
    console.log('LoginScreen: User tapped language back button');
    router.push('/language-select');
  };

  const titleText = translate('login', 'title', selectedLanguage);
  const subtitleText = translate('login', 'subtitle', selectedLanguage);
  const emailPlaceholder = translate('login', 'email', selectedLanguage);
  const passwordPlaceholder = translate('login', 'password', selectedLanguage);
  const signInButtonText = translate('login', 'signIn', selectedLanguage);
  const noAccountText = translate('login', 'noAccount', selectedLanguage);
  const signUpLinkText = translate('login', 'signUp', selectedLanguage);
  const backButtonText = translate('login', 'back', selectedLanguage);

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
              style={styles.languageBackButton}
              onPress={goToLanguageSelect}
              activeOpacity={0.7}
            >
              <Text style={styles.languageBackButtonText}>{backButtonText}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.form}>
            <TextInput
              style={styles.input}
              placeholder={emailPlaceholder}
              placeholderTextColor={colors.textSecondary}
              value={email}
              onChangeText={(text) => {
                setEmail(text.trim());
                setError('');
              }}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              editable={!loading}
            />

            <TextInput
              style={styles.input}
              placeholder={passwordPlaceholder}
              placeholderTextColor={colors.textSecondary}
              value={password}
              onChangeText={(text) => {
                setPassword(text);
                setError('');
              }}
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
                <Text style={styles.signInButtonText}>{signInButtonText}</Text>
              )}
            </TouchableOpacity>

            <View style={styles.signupLinkContainer}>
              <Text style={styles.noAccountText}>{noAccountText}</Text>
              <TouchableOpacity onPress={goToSignup} disabled={loading}>
                <Text style={styles.signupLinkText}>{signUpLinkText}</Text>
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
  languageBackButton: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 18,
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  languageBackButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.primary,
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
    marginLeft: 4,
  },
});
