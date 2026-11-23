import { z } from "zod";

import { AFFIRMATION_CATEGORIES } from "@/lib/affirmations";
import { affirmationFeed } from "@/server/affirmations";
import { loadConfig } from "@/server/config";
import { json, unauthorized } from "@/server/http";
import { accountIdOf, viewerFor } from "@/server/viewer";

const categorySchema = z.enum(AFFIRMATION_CATEGORIES);

export async function GET(req: Request) {
  const viewer = await viewerFor(req);
  if (!viewer) return unauthorized();
  const accountId = accountIdOf(viewer);
  const config = (await loadConfig(accountId)).config;
  const url = new URL(req.url);
  const category = categorySchema.safeParse(url.searchParams.get("category") ?? "general");
  const customRaw = url.searchParams.get("custom") ?? "";
  const custom = customRaw
    ? customRaw
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 24)
    : [];
  return json(affirmationFeed(config.location.timeZone, category.success ? category.data : "general", custom));
}
