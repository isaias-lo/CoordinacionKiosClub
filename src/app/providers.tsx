'use client';

import { AppProvider } from '../context/AppContext';
import { AuthProvider } from '../components/AuthProvider';
import { Toast } from '../components/Toast';
import { SplashScreen } from '../components/SplashScreen';
import { ClientShell } from '../components/layout/ClientShell';
import { Toaster } from 'sonner';
import type { ReactNode } from 'react';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <AppProvider>
        <ClientShell>
          {children}
        </ClientShell>
        <Toast />
        <SplashScreen />
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              fontFamily: 'Barlow, sans-serif',
              fontSize: 14,
              borderRadius: 10,
            },
            classNames: {
              error:   'border-l-4 border-red',
              success: 'border-l-4 border-success',
              warning: 'border-l-4 border-warn',
            },
          }}
        />
      </AppProvider>
    </AuthProvider>
  );
}
