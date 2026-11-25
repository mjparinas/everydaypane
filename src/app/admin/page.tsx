import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { staffEnabled } from "@/server/adminAuth";

import { AdminApp } from "./_ui/AdminApp";

export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };

/**
 * Platform ops (/admin/). Staff sign in with Clerk; allow-lists decide who gets in.
 * Household settings stay at /household/. When ADMIN_EMAILS is empty the panel is hidden.
 */
export default function PlatformAdminPage() {
  if (!staffEnabled()) redirect("/household/");
  return <AdminApp />;
}
