import type { MetadataRoute } from "next";

// APP_URL drives the absolute sitemap URL; it defaults to the local origin.
export const dynamic = "force-dynamic"; // APP_URL exists at runtime, not at build

const base = process.env.APP_URL || "http://localhost:3000";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${base}/sitemap.xml`,
  };
}
