import type { MetadataRoute } from "next";

// Special Next.js file convention — auto-served at /manifest.webmanifest and
// auto-linked in <head>, no manual <link rel="manifest"> needed. See
// node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/01-metadata/manifest.md.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FRAMES — Cinematic Landscape Video",
    short_name: "FRAMES",
    description:
      "FRAMES is the home for landscape creators. Every video full-screen and cinematic — 16:9, 21:9, and 16:10.",
    start_url: "/",
    display: "standalone",
    background_color: "#090909",
    theme_color: "#090909",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
