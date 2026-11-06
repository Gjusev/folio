import type { MetadataRoute } from "next";

// APP_URL drives the absolute sitemap URL; it defaults to the local origin.
const base = process.env.APP_URL || "http://localhost:3000";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${base}/sitemap.xml`,
  };
}
