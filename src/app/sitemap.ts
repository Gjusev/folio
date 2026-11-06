import type { MetadataRoute } from "next";

// Public, static routes only — the app pages sit behind auth.
const base = process.env.APP_URL || "http://localhost:3000";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["", "/login", "/register", "/impressum", "/datenschutz"].map((path) => ({
    url: `${base}${path}`,
    lastModified: new Date(),
  }));
}
