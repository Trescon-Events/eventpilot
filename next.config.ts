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
      bodySizeLimit: '200mb',
    },
    // Separate from serverActions.bodySizeLimit above — that only governs
    // Server Actions, not plain API routes (app/api/**/route.ts), which is
    // what every upload endpoint in this app actually is. Real bug found
    // live (2026-08-04): a genuine 10.6MB professional headshot got
    // silently truncated at Next's own DEFAULT 10MB cap before the route's
    // own, much friendlier 5MB check ever ran — producing a confusing raw
    // "Failed to parse body as FormData... expected boundary after body"
    // 500 instead of the intended "File too large" message. Raw speaker
    // photos from the field can be arbitrarily large and legitimately need
    // to come through uncapped (per Madhu: the upload pipeline immediately
    // downscales to a fixed stored resolution regardless of input size —
    // see MAX_STORED_PHOTO_DIMENSION in speaker-photo-engine.ts — so raw
    // size was never actually a meaningful constraint). Matches the
    // route-level MAX_SIZE ceiling in upload-asset/route.ts so that one
    // fires first, with a clean message, for anything truly pathological.
    // Raised 50mb -> 200mb 2026-08-06 while chasing a larger Corporate
    // Brand PDF ceiling — turned out the actual hard limit is Supabase's
    // storage plan tier (50MB, confirmed by direct API probing — see
    // app/lib/events/storage.ts), not this Next-level setting. Left at
    // 200mb anyway: it's a harmless outer ceiling with headroom for if the
    // Supabase plan is ever upgraded, and this must always clear the
    // largest route-level limit in the app for that route's own clean
    // error message to fire first (see the 2026-08-04 incident above).
    middlewareClientMaxBodySize: '200mb',
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
