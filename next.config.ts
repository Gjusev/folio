import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "same-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

// Pragmatic CSP: 'unsafe-inline' is unavoidable without nonce plumbing (Next's
// inline flight/bootstrap scripts); react-pdf serves its worker from 'self'
// (see PdfViewer.tsx) and draws on canvas, so object-src 'none' is safe and
// blob:/data: only need to cover images. Dev is exempt (HMR needs eval and
// websocket origins).
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "connect-src 'self'",
].join("; ");

const nextConfig: NextConfig = {
  // Every page here is per-user and dynamic; the static-shell optimisations of
  // cacheComponents buy nothing and force Suspense around every session read.
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers:
          process.env.NODE_ENV === "production"
            ? [...securityHeaders, { key: "Content-Security-Policy", value: contentSecurityPolicy }]
            : securityHeaders,
      },
    ];
  },
};

export default nextConfig;
