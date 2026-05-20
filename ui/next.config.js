/** @type {import('next').NextConfig} */
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8080';

const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  async rewrites() {
    return [
      {
        source: '/api/upload',
        destination: `${BACKEND_URL}/upload`,
      },
      {
        source: '/api/download/:code',
        destination: `${BACKEND_URL}/download/:code`,
      },
      {
        source: '/api/health',
        destination: `${BACKEND_URL}/health`,
      },
      {
        source: '/api/stats',
        destination: `${BACKEND_URL}/stats`,
      },
    ];
  },
};

module.exports = nextConfig;