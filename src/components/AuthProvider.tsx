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
  signOut: () => Promise<void>;
  /** Returns true if the current user can perform `action` on `section`. */
  can: (section: string, action: 'edit' | 'read') => boolean;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  profile: null,
  loading: true,
  signOut: async () => {},
  can: () => true,
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
  const [user, setUser]       = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const u = session?.user ?? null;
      setUser(u);
      setProfile(u ? profileFromUser(u) : null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null;
      setUser(u);
      setProfile(u ? profileFromUser(u) : null);
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
    return profile.permissions[section] !== 'read';
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, signOut, can }}>
      {children}
    </AuthContext.Provider>
  );
}
