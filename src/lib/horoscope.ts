// Playful daily horoscope blurbs (Melvin, 2026-11-23). Curated, not an astrology feed — fun kitchen wallpaper.

export const ZODIAC_SIGNS = [
  "aries",
  "taurus",
  "gemini",
  "cancer",
  "leo",
  "virgo",
  "libra",
  "scorpio",
  "sagittarius",
  "capricorn",
  "aquarius",
  "pisces",
] as const;

export type ZodiacSign = (typeof ZODIAC_SIGNS)[number];

export const ZODIAC_LABELS: Record<ZodiacSign, string> = {
  aries: "Aries",
  taurus: "Taurus",
  gemini: "Gemini",
  cancer: "Cancer",
  leo: "Leo",
  virgo: "Virgo",
  libra: "Libra",
  scorpio: "Scorpio",
  sagittarius: "Sagittarius",
  capricorn: "Capricorn",
  aquarius: "Aquarius",
  pisces: "Pisces",
};

const LINES: Record<ZodiacSign, readonly string[]> = {
  aries: [
    "A bold idea wants a five-minute start — lace up and go.",
    "Channel sparky energy into one clear yes today.",
    "Lead with warmth; the room will follow.",
  ],
  taurus: [
    "Steady wins: finish the small thing you keep postponing.",
    "Comfort counts — make one corner of home nicer.",
    "A patient answer beats a rushed one.",
  ],
  gemini: [
    "Two chats today open a useful door — listen twice.",
    "Write the witty thought down before it escapes.",
    "Curiosity is your commute; pick one new fact.",
  ],
  cancer: [
    "Tend the nest: a soft check-in with someone you love.",
    "Emotions are data — name one feeling out loud.",
    "Home is the project; a tiny tidy counts.",
  ],
  leo: [
    "Shine on purpose: share a win without shrinking it.",
    "Creative spark wants an audience of one — start anyway.",
    "Generosity looks good on you today.",
  ],
  virgo: [
    "Order one drawer or one inbox — clarity follows.",
    "Help someone with a practical tip; keep it kind.",
    "Details matter; perfection can wait.",
  ],
  libra: [
    "Balance a hard task with a beautiful pause.",
    "Diplomacy wins — find the fair middle path.",
    "Invite harmony: music, flowers or a calm walk.",
  ],
  scorpio: [
    "Go deep on one question; shallow noise can wait.",
    "Trust your read on a person — then verify gently.",
    "Transform a leftover into something useful.",
  ],
  sagittarius: [
    "Aim farther: plan a tiny adventure this week.",
    "Honest humour lands well — keep it kind.",
    "Learn one sentence in a language that excites you.",
  ],
  capricorn: [
    "Climb one rung: a checklist item that actually moves.",
    "Responsibility looks like care today — take pride in it.",
    "Long game thinking pays; plant one seed.",
  ],
  aquarius: [
    "Invent a better habit for the household.",
    "Friend-energy is high — send the weirdly perfect meme.",
    "Future-you appreciates a systems tweak now.",
  ],
  pisces: [
    "Dream, then do one grounded thing that serves it.",
    "Compassion first — including for yourself.",
    "Art or water nearby resets your mood.",
  ],
};

export function horoscopeFor(date: string, sign: ZodiacSign): string {
  const lines = LINES[sign];
  let h = 0;
  const key = `${date}:${sign}`;
  for (let i = 0; i < key.length; i++) h = (h * 33 + key.charCodeAt(i)) >>> 0;
  return lines[h % lines.length]!;
}
