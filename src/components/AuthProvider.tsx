'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

export type UserRole = 'auditor' | 'admin-auditoria' | 'despachador' | 'admin' | 'recepcion-tienda' | 'supervisor-picking' | 'asistente-despacho' | 'coordinador-flota' | 'supervisor' | (string & {});

export interface Profile {
  id: string;
  full_name: string | null;
  role: UserRole;
  allowedPaths: string[];
  permissions: Record<string, 'edit' | 'read'>;
}

interface AuthContextValue {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  accessToken: string | null;
  signOut: () => Promise<void>;
  /** Returns true if the current user can perform `action` on `section`. */
  can: (section: string, action: 'edit' | 'read') => boolean;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  profile: null,
  loading: true,
  accessToken: null,
  signOut: async () => {},
  can: () => false,
});

export function useAuth() {
  return useContext(AuthContext);
}

// Builds profile from JWT metadata — no DB call, no RLS issues.
function profileFromUser(user: User): Profile {
  const meta = user.user_metadata ?? {};
  const role = ((meta.role as string) ?? 'auditor') as UserRole;
  const allowedPaths = role === 'admin'
    ? ['*']
    : (meta.allowed_paths as string[] | undefined) ?? [];
  const permissions = role === 'admin'
    ? {}
    : ((meta.permissions as Record<string, 'edit' | 'read'>) ?? {});
  return {
    id: user.id,
    full_name: (meta.full_name as string) ?? user.email ?? null,
    role,
    allowedPaths,
    permissions,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]             = useState<User | null>(null);
  const [profile, setProfile]       = useState<Profile | null>(null);
  const [loading, setLoading]       = useState(true);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null;
      setUser(u);
      setProfile(u ? profileFromUser(u) : null);
      setAccessToken(session?.access_token ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const can = (section: string, action: 'edit' | 'read'): boolean => {
    if (!profile) return false;
    if (profile.role === 'admin') return true;
    if (action === 'read') return true;
    return profile.permissions[section] === 'edit';
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, accessToken, signOut, can }}>
      {children}
    </AuthContext.Provider>
  );
}
