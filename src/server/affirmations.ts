import "server-only";

import { affirmationFor, type AffirmationCategory } from "@/lib/affirmations";
import { localDate } from "@/lib/calendar";
import type { AffirmationData } from "@/lib/display/types";

/** One affirmation for the household's local today. */
export function affirmationFeed(timeZone: string, category: AffirmationCategory, custom: string[], now = Date.now()): AffirmationData {
  const today = localDate(now, timeZone);
  return {
    updatedAt: now,
    date: today,
    category,
    text: affirmationFor(today, category, custom),
  };
}
