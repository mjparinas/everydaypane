import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { staffEnabled } from "@/server/adminAuth";

import { AdminApp } from "./_ui/AdminApp";

export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };

/**
 * Platform ops (/admin/). Dedicated staff magic-link + 2FA (Tuned/Liftsmith).
 * Household settings stay at /household/. When ADMIN_EMAILS is empty the panel is hidden.
 */
export default function PlatformAdminPage() {
  if (!staffEnabled()) redirect("/household/");
  return <AdminApp />;
}
