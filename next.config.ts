import type { NextConfig } from 'next';

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

export default nextConfig;
