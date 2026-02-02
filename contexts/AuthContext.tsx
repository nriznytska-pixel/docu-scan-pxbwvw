
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '@/utils/supabase';
import { Session, User } from '@supabase/supabase-js';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
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

  useEffect(() => {
    console.log('AuthProvider: Checking initial session');
    
    // Check active session
    supabase.auth.getSession().then(({ data: { session } }) => {
      console.log('AuthProvider: Initial session check result:', session ? 'Session found' : 'No session');
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      console.log('AuthProvider: Auth state changed, event:', _event);
      console.log('AuthProvider: New session:', session ? 'Session active' : 'No session');
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => {
      console.log('AuthProvider: Cleaning up auth listener');
      subscription.unsubscribe();
    };
  }, []);

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
          emailRedirectTo: undefined, // Disable email confirmation
        },
      });

      if (error) {
        console.error('AuthProvider: signUp error:', error.message);
        return { error };
      }

      console.log('AuthProvider: signUp successful, user:', data.user?.email);
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
      
      // Always clear local state even if API call fails
      setUser(null);
      setSession(null);
    } catch (error: any) {
      console.error('AuthProvider: signOut exception:', error);
      // Always clear local state even if exception occurs
      setUser(null);
      setSession(null);
    }
  };

  const value = {
    user,
    session,
    loading,
    signIn,
    signUp,
    signOut,
  };

  console.log('AuthProvider: Rendering with user:', user?.email || 'null', 'loading:', loading);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
