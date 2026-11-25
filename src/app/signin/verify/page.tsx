import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Sign in" };

/** Magic-link verify URLs are retired; Clerk email codes live on `/signin/`. */
export default function VerifyPage() {
  redirect("/signin/");
}
