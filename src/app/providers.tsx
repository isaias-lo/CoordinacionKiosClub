'use client';

import { AppProvider } from '../context/AppContext';
import { AuthProvider } from '../components/AuthProvider';
import { Toast } from '../components/Toast';
import type { ReactNode } from 'react';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <AppProvider>
        {children}
        <Toast />
      </AppProvider>
    </AuthProvider>
  );
}
