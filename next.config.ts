import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  webpack: (config) => {
    // pdfjs-dist requiere que canvas esté aliased a false en entornos sin canvas nativo
    config.resolve.alias = {
      ...config.resolve.alias,
      canvas: false,
    };
    return config;
  },
};

export default nextConfig;
