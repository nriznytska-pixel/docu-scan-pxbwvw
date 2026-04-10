
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '@/utils/supabase';
import { Session, User } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const GUEST_STORAGE_KEY = 'is_guest';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isGuest: boolean;
  setGuestMode: (value: boolean) => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  console.log('AuthProvider: Initializing');
  
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isGuest, setIsGuest] = useState(false);

  useEffect(() => {
    console.log('AuthProvider: Checking initial session and guest flag');

    // Add a 5-second timeout fallback so loading never gets permanently stuck
    const loadingTimeout = setTimeout(() => {
      console.warn('AuthProvider: Loading timeout reached, forcing isLoading=false');
      setLoading(false);
    }, 5000);

    const init = async () => {
      try {
        const [sessionResult, guestFlag] = await Promise.all([
          supabase.auth.getSession(),
          AsyncStorage.getItem(GUEST_STORAGE_KEY),
        ]);

        const { data: { session }, error } = sessionResult;
        if (error) {
          console.error('AuthProvider: Error getting initial session:', error.message);
        }
        console.log('AuthProvider: Initial session check result:', session ? 'Session found' : 'No session');
        console.log('AuthProvider: Initial guest flag:', guestFlag);

        setSession(session);
        setUser(session?.user ?? null);
        setIsGuest(guestFlag === 'true');
      } catch (err) {
        console.error('AuthProvider: Exception during init:', err);
      } finally {
        clearTimeout(loadingTimeout);
        setLoading(false);
      }
    };

    init();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      console.log('AuthProvider: Auth state changed, event:', _event);
      console.log('AuthProvider: New session:', session ? 'Session active' : 'No session');
      setSession(session);
      setUser(session?.user ?? null);
      // Clear guest mode when a real session is established
      if (session) {
        setIsGuest(false);
      }
      setLoading(false);
    });

    return () => {
      clearTimeout(loadingTimeout);
      console.log('AuthProvider: Cleaning up auth listener');
      subscription.unsubscribe();
    };
  }, []);

  const setGuestMode = async (value: boolean) => {
    console.log('AuthProvider: setGuestMode called with:', value);
    try {
      if (value) {
        await AsyncStorage.setItem(GUEST_STORAGE_KEY, 'true');
      } else {
        await AsyncStorage.removeItem(GUEST_STORAGE_KEY);
      }
      setIsGuest(value);
    } catch (err) {
      console.error('AuthProvider: Failed to persist guest mode:', err);
      setIsGuest(value);
    }
  };

  const signIn = async (email: string, password: string) => {
    console.log('AuthProvider: signIn called for email:', email);
    
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        console.error('AuthProvider: signIn error:', error.message);
        return { error };
      }

      console.log('AuthProvider: signIn successful, user:', data.user?.email);
      console.log('AuthProvider: Session established:', !!data.session);
      // Clear any lingering guest flag on successful sign-in
      await AsyncStorage.removeItem(GUEST_STORAGE_KEY);
      setIsGuest(false);
      return { error: null };
    } catch (error: any) {
      console.error('AuthProvider: signIn exception:', error);
      return { error };
    }
  };

  const signUp = async (email: string, password: string) => {
    console.log('AuthProvider: signUp called for email:', email);
    
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: undefined,
        },
      });

      if (error) {
        console.error('AuthProvider: signUp error:', error.message);
        return { error };
      }

      console.log('AuthProvider: signUp successful, user:', data.user?.email);
      console.log('AuthProvider: Session established:', !!data.session);
      return { error: null };
    } catch (error: any) {
      console.error('AuthProvider: signUp exception:', error);
      return { error };
    }
  };

  const signOut = async () => {
    console.log('AuthProvider: signOut called');
    
    try {
      const { error } = await supabase.auth.signOut();
      
      if (error) {
        console.error('AuthProvider: signOut error:', error.message);
      } else {
        console.log('AuthProvider: signOut successful');
      }
    } catch (error: any) {
      console.error('AuthProvider: signOut exception:', error);
    } finally {
      // Always clear local state even if API call fails
      console.log('AuthProvider: Clearing local auth state');
      setUser(null);
      setSession(null);
      await AsyncStorage.removeItem(GUEST_STORAGE_KEY).catch(() => {});
      setIsGuest(false);
    }
  };

  const value = {
    user,
    session,
    loading,
    isGuest,
    setGuestMode,
    signIn,
    signUp,
    signOut,
  };

  console.log('AuthProvider: Rendering with user:', user?.email || 'null', 'loading:', loading, 'isGuest:', isGuest);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
