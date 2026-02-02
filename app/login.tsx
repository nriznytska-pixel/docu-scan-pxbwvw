
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

export default function LoginScreen() {
  console.log('LoginScreen: Component rendered');
  
  const router = useRouter();
  const { signIn } = useAuth();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSignIn = async () => {
    console.log('LoginScreen: User tapped "Увійти" button');
    console.log('LoginScreen: Email:', email);
    
    if (!email || !password) {
      console.log('LoginScreen: Validation failed - empty fields');
      setError('Будь ласка, заповніть всі поля');
      return;
    }

    setLoading(true);
    setError('');

    const { error: signInError } = await signIn(email, password);

    if (signInError) {
      console.error('LoginScreen: Sign in failed:', signInError.message);
      
      let errorMessage = 'Помилка входу. Перевірте email та пароль.';
      
      if (signInError.message.includes('Invalid login credentials')) {
        errorMessage = 'Невірний email або пароль';
      } else if (signInError.message.includes('Email not confirmed')) {
        errorMessage = 'Email не підтверджено';
      }
      
      setError(errorMessage);
      setLoading(false);
    } else {
      console.log('LoginScreen: Sign in successful, navigating to home');
      // Navigation will happen automatically via AuthContext
    }
  };

  const goToSignup = () => {
    console.log('LoginScreen: User tapped "Зареєструватися" link');
    router.push('/signup');
  };

  const titleText = '📬 DocuScan';
  const subtitleText = 'Ваш AI-помічник з офіційними листами';
  const emailPlaceholder = 'Email';
  const passwordPlaceholder = 'Пароль';
  const signInButtonText = 'Увійти';
  const noAccountText = 'Немає акаунту? ';
  const signUpLinkText = 'Зареєструватися';

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
