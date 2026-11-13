import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Time is Money",
    short_name: "Time",
    description: "Track work hours across devices and bill them at month end.",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f7f5",
    theme_color: "#0f7b5f",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
