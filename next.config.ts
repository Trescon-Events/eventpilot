import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next 16's built-in dev-tools badge (dev mode only) defaults to
  // bottom-left, where it sat on top of real page content (e.g. Knowledge
  // Base's document cards). It can't be fully hidden — Next always surfaces
  // real build/runtime issues regardless of `devIndicators: false` — so
  // moved to bottom-right instead, per Madhu's request, 15 Jul 2026.
  devIndicators: {
    position: 'bottom-right',
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb',
    },
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Cache-Control', value: 'no-store, must-revalidate' },
        ],
      },
    ]
  },
};

export default nextConfig;
