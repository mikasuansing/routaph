import type { NextConfig } from "next";

const isProduction = process.env.NODE_ENV === "production";

const securityHeaders = [
  ...(isProduction ? [{ key: "X-Frame-Options", value: "DENY" }] : []),
  { key: "X-Content-Type-Options",       value: "nosniff" },
  { key: "Referrer-Policy",              value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security",    value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Permissions-Policy",           value: "geolocation=(self), camera=(), microphone=()" },
  // CSP in report-only mode until all origins are confirmed (map tiles, Supabase, Upstash).
  // Switch to Content-Security-Policy once the Waze iframe origin (embed.waze.com) is decided.
  {
    key: "Content-Security-Policy-Report-Only",
    value: [
      "default-src 'self'",
      // Supabase
      "connect-src 'self' https://*.supabase.co https://*.upstash.io wss://*.supabase.co",
      // Leaflet + CARTO tiles
      "img-src 'self' data: https://*.tile.openstreetmap.org https://*.basemaps.cartocdn.com",
      // Google Fonts + Leaflet CSS (unpkg) used in auth/planner pages
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com",
      "font-src 'self' https://fonts.gstatic.com",
      // Inline scripts required by Next.js
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      // Waze Live Map embed (MAP-3) — allowlisted here so it's ready
      "frame-src https://embed.waze.com",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
