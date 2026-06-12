'use client';

import { AppProvider } from '../context/AppContext';
import { AuthProvider } from '../components/AuthProvider';
import { ThemeProvider } from '../context/ThemeContext';
import { Toast } from '../components/Toast';
import { SplashScreen } from '../components/SplashScreen';
import { ClientShell } from '../components/layout/ClientShell';
import { CommandPalette } from '../components/CommandPalette';
import { Toaster } from 'sonner';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '../lib/queryClient';
import type { ReactNode } from 'react';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
      <AuthProvider>
        <AppProvider>
          <ClientShell>
            {children}
          </ClientShell>
          <CommandPalette />
          <Toast />
          <SplashScreen />
          <Toaster
            position="top-right"
            toastOptions={{
              style: { fontFamily: 'Barlow, sans-serif', fontSize: 14, borderRadius: 10 },
              classNames: {
                error:   'border-l-4 border-red',
                success: 'border-l-4 border-success',
                warning: 'border-l-4 border-warn',
              },
            }}
          />
        </AppProvider>
      </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
