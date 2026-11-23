import { z } from "zod";

import { ZODIAC_SIGNS } from "@/lib/horoscope";
import { loadConfig } from "@/server/config";
import { horoscopeFeed } from "@/server/horoscope";
import { json, unauthorized } from "@/server/http";
import { accountIdOf, viewerFor } from "@/server/viewer";

const signSchema = z.enum(ZODIAC_SIGNS);

export async function GET(req: Request) {
  const viewer = await viewerFor(req);
  if (!viewer) return unauthorized();
  const accountId = accountIdOf(viewer);
  const config = (await loadConfig(accountId)).config;
  const sign = signSchema.safeParse(new URL(req.url).searchParams.get("sign") ?? "leo");
  return json(horoscopeFeed(config.location.timeZone, sign.success ? sign.data : "leo"));
}
