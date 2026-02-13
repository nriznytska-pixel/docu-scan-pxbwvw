
import { StyleSheet, ViewStyle, TextStyle } from 'react-native';

// Modern Light Theme Color System
export const colors = {
  // Backgrounds
  backgroundPrimary: '#F8FAFC',
  backgroundWhite: '#FFFFFF',
  surfaceSecondary: '#F1F5F9',
  surfaceHover: '#E2E8F0',
  
  // Accents
  accentBlue: '#3B82F6',
  accentBlueDark: '#2563EB',
  green: '#10B981',
  amber: '#D97706',
  red: '#DC2626',
  purple: '#7C3AED',
  
  // Text
  textPrimary: '#0F172A',
  textSecondary: '#475569',
  textMuted: '#94A3B8',
  
  // Borders
  border: 'rgba(15,23,42,0.06)',
  borderStronger: 'rgba(15,23,42,0.1)',
  
  // Legacy aliases for backward compatibility
  primary: '#3B82F6',
  secondary: '#2563EB',
  accent: '#10B981',
  background: '#F8FAFC',
  backgroundAlt: '#FFFFFF',
  text: '#0F172A',
  textSecondary: '#475569',
  card: '#FFFFFF',
  border: 'rgba(15,23,42,0.06)',
  error: '#DC2626',
  highlight: '#FEF3C7',
};

// Shadow Styles
export const shadows = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  cardHover: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 4,
  },
  button: {
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 4,
  },
};

export const buttonStyles = StyleSheet.create({
  instructionsButton: {
    backgroundColor: colors.accentBlue,
    alignSelf: 'center',
    width: '100%',
    ...shadows.button,
  },
  backButton: {
    backgroundColor: colors.backgroundWhite,
    alignSelf: 'center',
    width: '100%',
  },
});

export const commonStyles = StyleSheet.create({
  wrapper: {
    backgroundColor: colors.backgroundPrimary,
    width: '100%',
    height: '100%',
  },
  container: {
    flex: 1,
    backgroundColor: colors.backgroundPrimary,
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: 800,
    width: '100%',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
    color: colors.textPrimary,
    marginBottom: 10,
    fontFamily: Platform.select({
      ios: '-apple-system',
      android: 'sans-serif',
      web: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  text: {
    fontSize: 16,
    fontWeight: '400',
    color: colors.textSecondary,
    marginBottom: 8,
    lineHeight: 25.6, // 1.6 line height
    textAlign: 'center',
    fontFamily: Platform.select({
      ios: '-apple-system',
      android: 'sans-serif',
      web: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  section: {
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  buttonContainer: {
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  card: {
    backgroundColor: colors.backgroundWhite,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginVertical: 8,
    width: '100%',
    ...shadows.card,
  },
  icon: {
    width: 60,
    height: 60,
    tintColor: colors.accentBlue,
  },
});
