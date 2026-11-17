import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { SESSION_COOKIE, sessionFor } from "@/server/auth";
import { loadConfig } from "@/server/config";

export const metadata: Metadata = { title: "Admin" };

// Phase 1: who's signed in and the dashboard's saved version. The full editor arrives in Phase 3.
export default async function AdminPage() {
  const session = await sessionFor((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) redirect("/signin/?next=/admin/");
  if (session.role !== "admin") redirect("/family/");
  const { config, version } = await loadConfig();
  return (
    <main className="mx-auto grid max-w-3xl gap-4 p-6">
      <h1 className="text-3xl font-bold tracking-tight">{config.name}</h1>
      <div className="card">
        <p>
          Signed in as <strong>{session.email}</strong>.
        </p>
        <p className="mt-1 text-soft">
          {config.views.length} views · settings version {version}
        </p>
      </div>
    </main>
  );
}
