'use client';

import { usePathname } from 'next/navigation';
import { AppShell } from './AppShell';

/** Pages that should NOT have the sidebar (auth flows, public pages). */
const AUTH_PATHS = [
  '/login',
  '/registro',
  '/recuperar-contrasena',
  '/actualizar-contrasena',
  '/espera',
  '/r/',
];

function isAuthPath(pathname: string) {
  if (!pathname) return false;
  return AUTH_PATHS.some(p => pathname === p || pathname.startsWith(p));
}

export function ClientShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '';

  if (isAuthPath(pathname)) {
    return <>{children}</>;
  }

  return <AppShell>{children}</AppShell>;
}
