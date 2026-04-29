import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: ['xlsx', 'pdfjs-dist'],
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

    return config;
  },
};

export default nextConfig;
