import type { MetadataRoute } from "next";

// Lets the household panel and the family board be added to a phone or tablet home screen with the Everydaypane icon.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Everydaypane",
    short_name: "Everydaypane",
    description: "Your home, at a glance.",
    // Admins land on Household and family on Family (src/app/app/page.tsx).
    start_url: "/app/",
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
