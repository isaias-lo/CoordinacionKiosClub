import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

const nextConfig: NextConfig = {
  eslint: { ignoreDuringBuilds: true },
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
  // Only activate Sentry when DSN is present
  silent: !process.env.NEXT_PUBLIC_SENTRY_DSN,
  disableLogger: true,

  // Don't widen the bundle — only instrument when DSN is set
  widenClientFileUpload: false,

  // Source maps upload (requires SENTRY_AUTH_TOKEN + SENTRY_ORG + SENTRY_PROJECT)
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },

  // Automatically instrument Next.js data fetching methods
  autoInstrumentServerFunctions: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  autoInstrumentMiddleware: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  autoInstrumentAppDirectory: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
});
