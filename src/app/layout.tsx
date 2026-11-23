import type { Metadata, Viewport } from "next";
import { connection } from "next/server";

import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Everydaypane", template: "%s · Everydaypane" },
  description: "Your home, at a glance.",
  robots: { index: false, follow: false },
  // File conventions (app/favicon.ico, icon.svg, apple-icon.png) cover the defaults; these add every
  // size phones, tablets and pinned tabs ask for (Melvin, 2026-11-23).
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "48x48" },
      { url: "/icons/icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: [
      { url: "/icons/apple-touch-icon-180.png", sizes: "180x180" },
      { url: "/icons/apple-touch-icon-167.png", sizes: "167x167" },
      { url: "/icons/apple-touch-icon-152.png", sizes: "152x152" },
      { url: "/icons/apple-touch-icon-120.png", sizes: "120x120" },
    ],
    other: [{ rel: "mask-icon", url: "/brand/safari-pinned.svg", color: "#3b5bdb" }],
  },
  other: {
    "msapplication-TileColor": "#3b5bdb",
    "msapplication-TileImage": "/icons/icon-256.png",
  },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#3b5bdb" };

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Per-request CSP nonce from proxy.ts (Next applies it to its scripts only on a dynamic render).
  await connection();
  return (
    <html lang="en-CA">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
