import type { Metadata } from 'next';
import { Providers } from './providers';
import '../index.css';

export const metadata: Metadata = {
  title: 'KiosClub Despacho',
  description: 'Sistema de despacho KiosClub',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
