import "server-only";

import { localDate } from "@/lib/calendar";
import type { HoroscopeData } from "@/lib/display/types";
import { horoscopeFor, ZODIAC_LABELS, type ZodiacSign } from "@/lib/horoscope";

/** Playful daily line for a zodiac sign in the household's local today. */
export function horoscopeFeed(timeZone: string, sign: ZodiacSign, now = Date.now()): HoroscopeData {
  const today = localDate(now, timeZone);
  return {
    updatedAt: now,
    date: today,
    sign,
    label: ZODIAC_LABELS[sign],
    text: horoscopeFor(today, sign),
  };
}
