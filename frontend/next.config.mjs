import bundleAnalyzer from '@next/bundle-analyzer';

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

// URL interne du backend (utilisée par les rewrites côté serveur)
const BACKEND_INTERNAL_URL = process.env.BACKEND_INTERNAL_URL || 'https://cueforge-saas-production.up.railway.app';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Force un build ID unique pour invalider tous les caches après chaque deploy
  generateBuildId: () => `build-${Date.now()}`,
  output: 'standalone',
  reactStrictMode: true,
  swcMinify: true,
  productionBrowserSourceMaps: false,
  env: {
    // Chemin relatif : les appels API passent par le proxy Next.js (rewrites)
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || '/api/v1',
    // URL directe du backend pour les uploads (bypass proxy Next.js → plus de timeout)
    NEXT_PUBLIC_BACKEND_DIRECT_URL: process.env.NEXT_PUBLIC_BACKEND_DIRECT_URL || BACKEND_INTERNAL_URL + '/api/v1',
  },
  typescript: {
    ignoreBuildErrors: false,
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
      { protocol: 'https', hostname: 'trackcue.app' },            // Self
    ],
  },
  // Proxy /api/v1/* vers le backend Railway (même domaine = plus de CORS)
  async rewrites() {
    return {
      // beforeFiles : sert le nouveau design v4 Studio Neon sur les URLs in-app.
      // / est servi par app/page.tsx (landing marketing v4).
      // /login, /register, /pricing sont servis par app/*/page.tsx (v4 React).
      // Les sous-routes /dashboard/xxx, /admin/xxx, etc. continuent via app router.
      beforeFiles: [
        { source: '/dashboard',    destination: '/v4/stats.html'       },
        { source: '/analyze',      destination: '/v4/analyze.html'     },
        { source: '/library',      destination: '/v4/library.html'     },
        { source: '/compatible',   destination: '/v4/compatible.html'  },
        { source: '/set-builder',  destination: '/v4/set-builder.html' },
        { source: '/mix-studio',   destination: '/v4/mix-studio.html'  },
        { source: '/stats',        destination: '/v4/stats.html'       },
        { source: '/upload',       destination: '/v4/upload.html'      },
        { source: '/settings',     destination: '/v4/settings.html'    },
        { source: '/admin',        destination: '/v4/admin.html'       },
      ],
      afterFiles: [
        {
          source: '/api/v1/:path*',
          destination: `${BACKEND_INTERNAL_URL}/api/v1/:path*`,
        },
      ],
    };
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
      {
        source: '/images/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        source: '/:path*',
        headers: [
          // Empêche le CDN (Fastly/Railway) de cacher le HTML indéfiniment
          // s-maxage=60 → le CDN revalide toutes les 60s après un deploy
          // Les assets /_next/static/* gardent leur cache immutable grâce à la règle spécifique ci-dessus
          { key: 'Cache-Control', value: 'public, s-maxage=60, stale-while-revalidate=30' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
  // Body size limit élevé pour les rewrites proxy (fallback si direct URL non configuré)
  serverRuntimeConfig: {
    bodySizeLimit: '250mb',
  },
  experimental: {
    workerThreads: true,
    scrollRestoration: true,
    // Optimise le tree-shaking des packages les plus lourds
    optimizePackageImports: ['lucide-react', 'wavesurfer.js', 'swr', '@tanstack/react-query', '@tanstack/react-virtual'],
    // Augmente le body size pour le proxy rewrite (uploads audio)
    serverActions: {
      bodySizeLimit: '250mb',
    },
  },
  // Tree-shaking pour lucide-react
  modularizeImports: {
    'lucide-react': {
      transform: 'lucide-react/dist/esm/icons/{{ kebabCase member }}',
    },
  },
  // ⚡ Power-header pour les réponses de page
  poweredByHeader: false,
};

export default withBundleAnalyzer(nextConfig);
