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
  // @napi-rs/canvas ships a platform-specific native .node binary (used by
  // pdfjs-dist to rasterize PDF/AI company logos — app/lib/media/logo-engine.ts).
  // Turbopack's server bundler can't trace/bundle native addons correctly and
  // throws MODULE_NOT_FOUND even though the package is installed — this tells
  // Next to require() it directly from node_modules at runtime instead.
  serverExternalPackages: ['@napi-rs/canvas', 'pdfjs-dist'],
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
