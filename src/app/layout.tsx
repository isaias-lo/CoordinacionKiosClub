import type { Metadata } from 'next';
import { Providers } from './providers';
import '../index.css';

// Auth-protected app — disable static prerendering for all routes
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'KiosClub Despacho',
  description: 'Sistema de despacho KiosClub',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      {/* Prevent flash of wrong theme before React hydrates */}
      <head>
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem('kc-theme');if(t==='dark')document.documentElement.classList.add('dark');}catch(e){}})();` }} />
      </head>
      <body>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
