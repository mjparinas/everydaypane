// Headline presets for the news widget (Phase 5). Public RSS feeds only — no API key.

export const NEWS_PRESETS = [
  { id: "cbc-bc", name: "CBC British Columbia", url: "https://rss.cbc.ca/lineup/canada-britishcolumbia.xml" },
  { id: "cbc-top", name: "CBC Top stories", url: "https://rss.cbc.ca/lineup/topstories.xml" },
  { id: "bbc-world", name: "BBC World", url: "https://feeds.bbci.co.uk/news/world/rss.xml" },
  { id: "bbc-canada", name: "BBC Canada", url: "https://feeds.bbci.co.uk/news/world/us_and_canada/rss.xml" },
] as const;

export type NewsPresetId = (typeof NEWS_PRESETS)[number]["id"];

export function newsPresetUrl(id: NewsPresetId): string {
  return NEWS_PRESETS.find((p) => p.id === id)?.url ?? "";
}
