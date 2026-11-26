import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { accountById } from "@/server/accounts";
import { unconfiguredFlagsNow } from "@/server/adminSystem";
import { currentHouseholdSession, SESSION_COOKIE } from "@/server/auth";
import { loadConfig } from "@/server/config";
import { flagsOffFresh } from "@/server/featureFlags";
import { isStaffEmail } from "@/server/staff";

import { Admin } from "./_ui/Admin";

export const metadata: Metadata = { title: "Household" };

export default async function HouseholdPage() {
  const session = await currentHouseholdSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) redirect("/signin/?next=/household/");
  if (session.role !== "admin") redirect("/family/");
  const [{ config, version }, account, off] = await Promise.all([
    loadConfig(session.accountId),
    accountById(session.accountId),
    flagsOffFresh(),
  ]);
  return (
    <Admin
      initial={config}
      version={version}
      email={session.email}
      staff={isStaffEmail(session.email)}
      initialPlan={account?.plan ?? "free"}
      flagsOff={[...off]}
      unconfigured={unconfiguredFlagsNow()}
    />
  );
}
