'use client';

import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { Session, User, AuthError as SupabaseAuthError } from '@supabase/supabase-js';
import { getBrowserClient } from '@/lib/supabase-browser';
import type { Profile } from '@/lib/types';
import { profileLoadMessage } from '@/lib/profile-error';

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  session: Session | null;
  loading: boolean;
  authError: string | null;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, displayName: string) => Promise<{ error: string | null; needsConfirmation?: boolean }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const supabase = getBrowserClient();

  const fetchProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
    const message = profileLoadMessage(error, !!data);
    if (message) throw new Error(message);
    return data as Profile;
  }, [supabase]);

  useEffect(() => {
    let mounted = true;
    let revision = 0;
    const applySession = async (nextSession: Session | null) => {
      const current = ++revision;
      setLoading(true);
      setAuthError(null);
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setProfile(null);
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        if (nextSession?.user) {
          const profile = await Promise.race([
            fetchProfile(nextSession.user.id),
            new Promise<never>((_, reject) => {
              timer = setTimeout(() => reject(new Error('Loading your account timed out. Please retry.')), 12000);
            }),
          ]);
          if (mounted && current === revision) setProfile(profile);
        }
      } catch (error) {
        if (mounted && current === revision) setAuthError(error instanceof Error ? error.message : 'Unable to load your account.');
      } finally {
        clearTimeout(timer);
        if (mounted && current === revision) setLoading(false);
      }
    };

    const startupTimer = setTimeout(() => {
      if (mounted) {
        setAuthError('Loading your account timed out. Please retry.');
        setLoading(false);
      }
    }, 15000);
    supabase.auth.getSession().then(({ data: { session }, error }: { data: { session: Session | null }; error: SupabaseAuthError | null }) => {
      if (!mounted) return;
      clearTimeout(startupTimer);
      if (error) {
        setAuthError('Unable to restore your session. Please sign in again.');
        setLoading(false);
      } else {
        void applySession(session);
      }
    }).catch(() => {
      if (mounted) {
        clearTimeout(startupTimer);
        setAuthError('Unable to restore your session. Please sign in again.');
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: string, session: Session | null) => {
      // Supabase holds its auth lock during this callback. Defer database work.
      setTimeout(() => {
        if (mounted) void applySession(session);
      }, 0);
    });

    return () => {
      mounted = false;
      revision++;
      clearTimeout(startupTimer);
      subscription.unsubscribe();
    };
  }, [supabase, fetchProfile]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message || null };
  }, [supabase]);

  const signUp = useCallback(async (email: string, password: string, displayName: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName } },
    });
    if (error) return { error: error.message };
    return { error: null, needsConfirmation: !data.session };
  }, [supabase]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setSession(null);
    setAuthError(null);
  }, [supabase]);

  const refreshProfile = useCallback(async () => {
    if (user) setProfile(await fetchProfile(user.id));
  }, [user, fetchProfile]);

  return (
    <AuthContext.Provider value={{ user, profile, session, loading, authError, signIn, signUp, signOut, refreshProfile }}>
      {authError ? (
        <div className="flex min-h-screen items-center justify-center p-6">
          <div className="w-full max-w-md space-y-4 rounded-lg border bg-card p-6" role="alert">
            <h1 className="text-xl font-semibold">Unable to open your account</h1>
            <p className="text-sm text-muted-foreground">{authError}</p>
            <div className="flex gap-4">
              <button className="font-medium text-primary underline" onClick={() => window.location.reload()}>Retry</button>
              <button className="font-medium text-primary underline" onClick={() => { void signOut().then(() => { window.location.href = '/login'; }); }}>Sign in again</button>
            </div>
          </div>
        </div>
      ) : children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
