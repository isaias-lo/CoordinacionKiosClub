'use client';

import { usePathname } from 'next/navigation';
import { AppShell } from './AppShell';
import { isAuthPath } from './authPaths';

export function ClientShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '';

  if (isAuthPath(pathname)) {
    return <>{children}</>;
  }

  return <AppShell>{children}</AppShell>;
}
