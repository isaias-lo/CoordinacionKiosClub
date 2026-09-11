import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

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

export default withSentryConfig(nextConfig, {
  silent: !process.env.NEXT_PUBLIC_SENTRY_DSN,
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
  webpack: {
    treeshake: { removeDebugLogging: true },
    autoInstrumentServerFunctions: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
    autoInstrumentMiddleware: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
    autoInstrumentAppDirectory: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  },
});
