import bundleAnalyzer from '@next/bundle-analyzer';

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'https://cueforge-saas-production.up.railway.app/api/v1',
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Compression des assets statiques
  compress: true,
  // Optimisation des images
  images: {
    formats: ['image/webp', 'image/avif'],
    minimumCacheTTL: 86400, // 24h
    remotePatterns: [
      { protocol: 'https', hostname: 'i.scdn.co' },              // Spotify artworks
      { protocol: 'https', hostname: 'coverartarchive.org' },     // MusicBrainz covers
      { protocol: 'https', hostname: '**.mzstatic.com' },         // iTunes/Apple Music
      { protocol: 'https', hostname: 'lastfm.freetls.fastly.net' }, // Last.fm
      { protocol: 'https', hostname: 'is*.mzstatic.com' },        // iTunes variants
      { protocol: 'https', hostname: 'cueforge.app' },            // Self
    ],
  },
  // Headers de cache pour les assets statiques
  async headers() {
    return [
      {
        source: '/_next/static/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        source: '/fonts/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
    ];
  },
  experimental: {
    workerThreads: true,
    // Optimise le tree-shaking des packages les plus lourds
    optimizePackageImports: ['lucide-react', 'wavesurfer.js', 'swr', '@tanstack/react-query', '@tanstack/react-virtual'],
  },
  // ⚡ Power-header pour les réponses de page
  poweredByHeader: false,
};

export default withBundleAnalyzer(nextConfig);
