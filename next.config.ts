import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';
import withSerwistInit from '@serwist/next';

const nextConfig: NextConfig = {
  eslint: { ignoreDuringBuilds: true },

  // Con qué commit se compiló este bundle. La pestaña lo compara con /api/version para saber si
  // quedó corriendo una versión vieja y avisar (ver lib/versionApp.ts). Se fija en el build: es
  // exactamente lo que se quiere, porque identifica al código que el navegador tiene cargado.
  env: { NEXT_PUBLIC_APP_VERSION: process.env.VERCEL_GIT_COMMIT_SHA ?? 'dev' },

  serverExternalPackages: ['xlsx', 'nodemailer'],
  webpack: (config, { isServer }) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      canvas: false,
    };

    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        stream: false,
        crypto: false,
        buffer: false,
      };
    }

    if (process.env.NODE_ENV === 'development') {
      // Prevent "RangeError: Failed to allocate memory" in webpack pack cache
      config.cache = { type: 'filesystem', maxMemoryGenerations: 0 } as typeof config.cache;
    }

    return config;
  },
};

/**
 * Service worker. Compila src/app/sw.ts a public/sw.js (ignorado por git: es artefacto de build).
 *
 * Tres opciones acá NO son el valor por defecto, y las tres por el mismo motivo: los defaults de
 * Serwist recargan o cachean por su cuenta, y esta app tiene una regla escrita a sangre sobre eso
 * (ver el encabezado de src/app/sw.ts y src/lib/versionApp.ts).
 */
const withSerwist = withSerwistInit({
  swSrc: 'src/app/sw.ts',
  swDest: 'public/sw.js',

  // En desarrollo estorba: sirve código guardado y manda a perseguir bugs que no existen.
  disable: process.env.NODE_ENV === 'development',

  // El registro lo hace src/lib/sw/registrarSW.ts, no Serwist. Ese módulo es el que implementa la
  // salida de emergencia (NEXT_PUBLIC_SW_DISABLED) y el que detecta la versión en espera para el
  // aviso. Si Serwist registrara también, habría dos registros compitiendo.
  register: false,

  // El default es `true`: recarga la app sola apenas vuelve la conexión. Es exactamente lo que no
  // se puede hacer acá — a alguien cargando un camión en el patio, donde la señal va y viene, le
  // borraría la pantalla a mitad del formulario cada vez que reaparece.
  reloadOnOnline: false,

  // /offline no es un archivo de public/ sino una ruta, así que se agrega a mano. La revisión es el
  // commit del despliegue: cambia con cada publicación y así el worker la vuelve a buscar.
  //
  // OJO con el nombre: `additionalPrecacheEntries` NO se suma a los archivos de public/, los
  // REEMPLAZA. En el plugin es `resolvedManifestEntries = additionalPrecacheEntries ?? glob(...)`,
  // o sea que en cuanto esta opción existe, `globPublicPatterns` deja de mirarse. Los assets con
  // hash de /_next/static no dependen de esto —los inyecta el propio build, son 185 archivos y unos
  // 5 MB—, pero lo de public/ sí: por eso los íconos y el worker de PDF se guardan con las reglas
  // CacheFirst y StaleWhileRevalidate de sw.ts, en el primer uso, y no al instalar.
  additionalPrecacheEntries: [
    { url: '/offline', revision: process.env.VERCEL_GIT_COMMIT_SHA ?? 'dev' },
  ],
});

export default withSentryConfig(withSerwist(nextConfig), {
  silent: !process.env.NEXT_PUBLIC_SENTRY_DSN,
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
  webpack: {
    treeshake: { removeDebugLogging: true },
    autoInstrumentServerFunctions: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
    autoInstrumentMiddleware: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
    autoInstrumentAppDirectory: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  },
});
