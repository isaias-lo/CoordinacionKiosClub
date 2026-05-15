'use client';

import { AppProvider } from '../context/AppContext';
import { AuthProvider } from '../components/AuthProvider';
import { Toast } from '../components/Toast';
import { SplashScreen } from '../components/SplashScreen';
import type { ReactNode } from 'react';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <AppProvider>
        {children}
        <Toast />
        <SplashScreen />
      </AppProvider>
    </AuthProvider>
  );
}
