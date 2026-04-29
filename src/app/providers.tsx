'use client';

import { AppProvider } from '../context/AppContext';
import { Toast } from '../components/Toast';
import type { ReactNode } from 'react';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <AppProvider>
      {children}
      <Toast />
    </AppProvider>
  );
}
