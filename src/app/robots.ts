import type { MetadataRoute } from "next";

// APP_URL drives the absolute sitemap URL; it defaults to the local origin.
export const revalidate = 3600; // read APP_URL at runtime, not build time

const base = process.env.APP_URL || "http://localhost:3000";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${base}/sitemap.xml`,
  };
}
