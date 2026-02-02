
import React, { useState } from 'react';
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

export default function SignupScreen() {
  console.log('SignupScreen: Component rendered');
  
  const router = useRouter();
  const { signUp } = useAuth();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSignUp = async () => {
    console.log('SignupScreen: User tapped "Зареєструватися" button');
    console.log('SignupScreen: Email:', email);
    
    if (!email || !password || !confirmPassword) {
      console.log('SignupScreen: Validation failed - empty fields');
      setError('Будь ласка, заповніть всі поля');
      return;
    }

    if (password.length < 6) {
      console.log('SignupScreen: Validation failed - password too short');
      setError('Пароль повинен містити мінімум 6 символів');
      return;
    }

    if (password !== confirmPassword) {
      console.log('SignupScreen: Validation failed - passwords do not match');
      setError('Паролі не співпадають');
      return;
    }

    setLoading(true);
    setError('');

    const { error: signUpError } = await signUp(email, password);

    if (signUpError) {
      console.error('SignupScreen: Sign up failed:', signUpError.message);
      
      let errorMessage = 'Помилка реєстрації. Спробуйте ще раз.';
      
      if (signUpError.message.includes('already registered')) {
        errorMessage = 'Цей email вже зареєстрований';
      } else if (signUpError.message.includes('Invalid email')) {
        errorMessage = 'Невірний формат email';
      }
      
      setError(errorMessage);
      setLoading(false);
    } else {
      console.log('SignupScreen: Sign up successful, navigating to home');
      // Navigation will happen automatically via AuthContext
    }
  };

  const goToLogin = () => {
    console.log('SignupScreen: User tapped "Увійти" link');
    router.back();
  };

  const titleText = '📬 Реєстрація';
  const emailPlaceholder = 'Email';
  const passwordPlaceholder = 'Пароль (мінімум 6 символів)';
  const confirmPasswordPlaceholder = 'Підтвердіть пароль';
  const signUpButtonText = 'Зареєструватися';
  const hasAccountText = 'Вже є акаунт? ';
  const signInLinkText = 'Увійти';

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
              <Text style={styles.hasAccountText}>{hasAccountText}</Text>
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
