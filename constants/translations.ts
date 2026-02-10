
export const translations = {
  login: {
    title: {
      uk: '📬 DocuScan',
      en: '📬 DocuScan',
      ar: '📬 DocuScan',
      tr: '📬 DocuScan',
      ti: '📬 DocuScan',
      pl: '📬 DocuScan',
    },
    subtitle: {
      uk: 'Ваш AI-помічник з офіційними листами',
      en: 'Your AI assistant for official letters',
      ar: 'مساعدك الذكي للرسائل الرسمية',
      tr: 'Resmi mektuplar için AI asistanınız',
      ti: 'ናይ ወግዓዊ ደብዳቤታት AI ሓጋዚኻ',
      pl: 'Twój asystent AI do oficjalnych listów',
    },
    email: {
      uk: 'Email',
      en: 'Email',
      ar: 'البريد الإلكتروني',
      tr: 'E-posta',
      ti: 'ኢመይል',
      pl: 'Email',
    },
    password: {
      uk: 'Пароль',
      en: 'Password',
      ar: 'كلمة المرور',
      tr: 'Şifre',
      ti: 'መሕለፊ ቃል',
      pl: 'Hasło',
    },
    signIn: {
      uk: 'Увійти',
      en: 'Sign in',
      ar: 'تسجيل الدخول',
      tr: 'Giriş yap',
      ti: 'እቶ',
      pl: 'Zaloguj się',
    },
    noAccount: {
      uk: 'Немає акаунту? ',
      en: 'No account? ',
      ar: 'ليس لديك حساب؟ ',
      tr: 'Hesabınız yok mu? ',
      ti: 'ኣካውንት የብልካን? ',
      pl: 'Nie masz konta? ',
    },
    signUp: {
      uk: 'Зареєструватися',
      en: 'Sign up',
      ar: 'إنشاء حساب',
      tr: 'Kaydol',
      ti: 'ተመዝገብ',
      pl: 'Zarejestruj się',
    },
    back: {
      uk: '← Українська',
      en: '← English',
      ar: '← العربية',
      tr: '← Türkçe',
      ti: '← ትግርኛ',
      pl: '← Polski',
    },
  },
  signup: {
    title: {
      uk: '📬 Реєстрація',
      en: '📬 Sign Up',
      ar: '📬 إنشاء حساب',
      tr: '📬 Kaydol',
      ti: '📬 ተመዝገብ',
      pl: '📬 Rejestracja',
    },
    email: {
      uk: 'Email',
      en: 'Email',
      ar: 'البريد الإلكتروني',
      tr: 'E-posta',
      ti: 'ኢመይል',
      pl: 'Email',
    },
    password: {
      uk: 'Пароль (мінімум 6 символів)',
      en: 'Password (minimum 6 characters)',
      ar: 'كلمة المرور (6 أحرف على الأقل)',
      tr: 'Şifre (en az 6 karakter)',
      ti: 'መሕለፊ ቃል (ብውሑዱ 6 ፊደላት)',
      pl: 'Hasło (minimum 6 znaków)',
    },
    confirmPassword: {
      uk: 'Підтвердіть пароль',
      en: 'Confirm password',
      ar: 'تأكيد كلمة المرور',
      tr: 'Şifreyi onayla',
      ti: 'መሕለፊ ቃል ኣረጋግጽ',
      pl: 'Potwierdź hasło',
    },
    signUpButton: {
      uk: 'Зареєструватися',
      en: 'Sign up',
      ar: 'إنشاء حساب',
      tr: 'Kaydol',
      ti: 'ተመዝገብ',
      pl: 'Zarejestruj się',
    },
    alreadyAccount: {
      uk: 'Вже є акаунт? ',
      en: 'Already have an account? ',
      ar: 'لديك حساب بالفعل؟ ',
      tr: 'Zaten hesabınız var mı? ',
      ti: 'ኣካውንት ኣለካ? ',
      pl: 'Masz już konto? ',
    },
    signIn: {
      uk: 'Увійти',
      en: 'Sign in',
      ar: 'تسجيل الدخول',
      tr: 'Giriş yap',
      ti: 'እቶ',
      pl: 'Zaloguj się',
    },
    back: {
      uk: '← Назад',
      en: '← Back',
      ar: '← رجوع',
      tr: '← Geri',
      ti: '← ድሕሪት',
      pl: '← Wstecz',
    },
  },
  home: {
    myLetters: {
      uk: 'Мої листи',
      en: 'My letters',
      ar: 'رسائلي',
      tr: 'Mektuplarım',
      ti: 'ደብዳቤታተይ',
      pl: 'Moje listy',
    },
    scanLetter: {
      uk: 'Сканувати лист',
      en: 'Scan letter',
      ar: 'مسح الرسالة',
      tr: 'Mektup tara',
      ti: 'ደብዳቤ ስካን ግበር',
      pl: 'Skanuj list',
    },
    settings: {
      uk: 'Налаштування',
      en: 'Settings',
      ar: 'الإعدادات',
      tr: 'Ayarlar',
      ti: 'ምቅራጻት',
      pl: 'Ustawienia',
    },
  },
};

export function translate(screen: keyof typeof translations, key: string, language: string): string {
  const screenTranslations = translations[screen];
  if (!screenTranslations) {
    console.warn(`Translation screen not found: ${screen}`);
    return key;
  }

  const keyTranslations = screenTranslations[key as keyof typeof screenTranslations];
  if (!keyTranslations) {
    console.warn(`Translation key not found: ${screen}.${key}`);
    return key;
  }

  const translation = (keyTranslations as any)[language];
  if (!translation) {
    console.warn(`Translation not found for language: ${screen}.${key}.${language}`);
    return (keyTranslations as any)['en'] || key;
  }

  return translation;
}
