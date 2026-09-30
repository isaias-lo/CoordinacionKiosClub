import type { Metadata, Viewport } from 'next';
import { Providers } from './providers';
import { AvisoVersionNueva } from '@/components/AvisoVersionNueva';
import { EstadoConexion } from '@/components/EstadoConexion';
import { pantallasDeInicio } from '@/lib/splash';
import '../index.css';

// Auth-protected app — disable static prerendering for all routes
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'KiosClub Despacho',
  description: 'Sistema de despacho KiosClub',

  // iOS ignora el manifest para instalar: lee estas dos. Sin `apple-touch-icon` pone una captura
  // de la pantalla como ícono, y sin `appleWebApp.capable` abre Safari con toda su barra.
  icons: { apple: '/apple-touch-icon.png' },
  appleWebApp: {
    capable: true,
    title: 'KiosClub',
    // `black` deja la barra de estado casi del mismo color que el encabezado de la app (#0D1829).
    // `black-translucent` se vería mejor, pero mete el contenido DEBAJO de la barra, y todavía no
    // hay ningún `env(safe-area-inset-*)` en el CSS que lo compense: el título del encabezado
    // quedaría tapado por la hora en cualquier iPhone con notch.
    statusBarStyle: 'black',

    // Sin esto, la app instalada en iPhone se abre con una pantalla en blanco de varios segundos
    // mientras carga: iOS no tiene splash propia como Android. Ver src/lib/splash.ts.
    startupImage: pantallasDeInicio(),
  },

  // `appleWebApp.capable` hace que Next emita el nombre moderno, `mobile-web-app-capable`, y solo
  // ese (verificado en el HTML compilado). Safari lo entiende recién desde iOS 17.4; en un iPad de
  // bodega más viejo, sin la variante con prefijo `apple-`, el ícono instalado abre Safari con toda
  // la barra de direcciones en vez de abrir la app. Las dos conviven sin problema.
  other: { 'apple-mobile-web-app-capable': 'yes' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,

  // Un solo valor, sin variante por `prefers-color-scheme`: el modo oscuro de esta app no sale de
  // la preferencia del sistema sino de la clase `dark` que pone el script de abajo leyendo
  // `kc-theme` de localStorage, así que una consulta por esquema acertaría solo la mitad de las
  // veces. Da igual: el encabezado (`--gradient-dark-h`) es oscuro en los dos temas.
  themeColor: '#0D1829',

  // NO se pone `maximumScale` ni `userScalable: false`. Bloquear el zoom en una app que se usa con
  // guantes, en un patio y a contraluz es quitarle a alguien la única forma de leer la pantalla.

  // Tampoco `viewportFit: 'cover'` todavía: sin `env(safe-area-inset-*)` en el CSS, el contenido se
  // metería bajo el notch y el indicador de inicio. Entra cuando se agreguen esos márgenes.
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
          {/* Avisa si esta pestaña quedó con una versión vieja (arreglos publicados durante el día) */}
          <AvisoVersionNueva />
          {/* Sin señal, o con trabajo guardado sin enviar. No dibuja nada cuando no hay nada que decir. */}
          <EstadoConexion />
        </Providers>
      </body>
    </html>
  );
}
