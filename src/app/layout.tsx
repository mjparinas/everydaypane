import type { Metadata, Viewport } from "next";
import { connection } from "next/server";

import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Everydaypane", template: "%s · Everydaypane" },
  description: "Your home, at a glance.",
  robots: { index: false, follow: false },
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
