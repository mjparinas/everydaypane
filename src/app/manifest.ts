import type { MetadataRoute } from "next";

// Lets the admin panel and the family board be added to a phone or tablet home screen with the Everydaypane icon.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Everydaypane",
    short_name: "Everydaypane",
    description: "Your home, at a glance.",
    start_url: "/admin/",
    scope: "/",
    display: "standalone",
    background_color: "#f6f7fb",
    theme_color: "#3b5bdb",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
