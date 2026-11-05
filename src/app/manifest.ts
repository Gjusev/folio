import type { MetadataRoute } from "next";

// Makes the deployed app installable ("Install Folio" in the browser),
// so self-hosted instances behave like a local program without Electron.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Folio",
    short_name: "Folio",
    description:
      "The open workspace for writing scientific papers with AI: any model, verifiable citations, LaTeX compiled in a sandbox.",
    start_url: "/projects",
    display: "standalone",
    background_color: "#f6f5f1",
    theme_color: "#f6f5f1",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
