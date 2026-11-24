import { NextResponse } from "next/server";

import { DISPLAY_PATH } from "@/lib/site";

// Bare `/d/<token>/` no longer unlocks the wall (Melvin, 2026-11-23). Edit and chores under `/d/<token>/…` stay.
export async function GET(req: Request) {
  return NextResponse.redirect(new URL(DISPLAY_PATH, req.url), 308);
}
