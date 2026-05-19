/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  async rewrites() {
    return [
      {
        source: '/api/upload',
        destination: 'http://localhost:8080/upload',
      },
      {
        source: '/api/download/:code',
        destination: 'http://localhost:8080/download/:code',
      },
      {
        source: '/api/health',
        destination: 'http://localhost:8080/health',
      },
    ];
  },
};

module.exports = nextConfig;
