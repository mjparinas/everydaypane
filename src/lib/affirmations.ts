// Curated daily affirmations for the wall (Melvin, 2026-11-23). No upstream API — stable, family-friendly lines.
// Shared by the server feed so the display stays a thin client.

export const AFFIRMATION_CATEGORIES = ["general", "kids", "calm", "courage"] as const;
export type AffirmationCategory = (typeof AFFIRMATION_CATEGORIES)[number];

export const AFFIRMATION_CATEGORY_LABELS: Record<AffirmationCategory, string> = {
  general: "General",
  kids: "Kids",
  calm: "Calm",
  courage: "Courage",
};

const BANK: Record<AffirmationCategory, readonly string[]> = {
  general: [
    "You are enough for today.",
    "Small steps still count.",
    "This household is a good place to be.",
    "You can begin again at any hour.",
    "Kindness is a plan.",
    "Rest is part of the work.",
    "You belong here.",
    "Progress can be quiet.",
  ],
  kids: [
    "You are brave when you try.",
    "Your ideas matter.",
    "Mistakes help you learn.",
    "You can ask for help.",
    "Being kind is a superpower.",
    "Your best is enough today.",
    "You make this home brighter.",
    "Curiosity is cool.",
  ],
  calm: [
    "Breathe in. You are here.",
    "This moment does not need hurrying.",
    "Soft shoulders. Soft jaw.",
    "You can let one worry wait.",
    "Quiet is allowed.",
    "The day can unfold without force.",
    "You are safe to slow down.",
    "One calm breath resets the room.",
  ],
  courage: [
    "You can do hard things gently.",
    "Courage is showing up anyway.",
    "Speak up — your voice belongs.",
    "Fear can ride along; you still steer.",
    "Try the next brave minute.",
    "You have handled hard days before.",
    "Ask for what you need.",
    "Standing up for yourself is love.",
  ],
};

/** Stable pick for a local calendar day (YYYY-MM-DD) so every display agrees. */
export function affirmationFor(date: string, category: AffirmationCategory, custom: readonly string[] = []): string {
  const pool = [...(BANK[category] ?? BANK.general), ...custom.map((s) => s.trim()).filter(Boolean)].filter(Boolean);
  if (!pool.length) return "You are enough for today.";
  let h = 0;
  const key = `${date}:${category}`;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return pool[h % pool.length]!;
}
