
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

export default function SignupScreen() {
  console.log('SignupScreen: Component rendered');
  
  const router = useRouter();
  const { signUp } = useAuth();
  const { selectedLanguage, refreshLanguage } = useLanguage();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Refresh language from storage when component mounts
  useEffect(() => {
    console.log('SignupScreen: Refreshing language from storage');
    refreshLanguage();
  }, []);

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
    router.back();
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

            <TextInput
              style={styles.input}
              placeholder={passwordPlaceholder}
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
              placeholder={confirmPasswordPlaceholder}
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
                <Text style={styles.signUpButtonText}>{signUpButtonText}</Text>
              )}
            </TouchableOpacity>

            <View style={styles.loginLinkContainer}>
              <Text style={styles.hasAccountText}>{alreadyAccountText}</Text>
              <TouchableOpacity onPress={goToLogin} disabled={loading}>
                <Text style={styles.loginLinkText}>{signInLinkText}</Text>
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
