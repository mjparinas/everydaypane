import { describe, expect, it } from "vitest";

import { newWidget } from "./config/widgets";
import { instagramEmbedUrl, mapsEmbedUrl, tradingViewUrl, youtubeEmbedUrl } from "./embeds";

describe("embeds", () => {
  it("builds TradingView, YouTube and Maps addresses", () => {
    const tv = newWidget("tradingView", "t", { x: 0, y: 0 });
    expect(tradingViewUrl(tv, true)).toContain("tradingview.com");
    const yt = newWidget("youtube", "y", { x: 0, y: 0 });
    yt.videoId = "abc123";
    expect(youtubeEmbedUrl(yt)).toContain("abc123");
    const map = newWidget("maps", "m", { x: 0, y: 0 });
    expect(mapsEmbedUrl(map)).toContain("Langley");
  });

  it("turns an Instagram post link into an embed path", () => {
    const ig = newWidget("instagram", "i", { x: 0, y: 0 });
    ig.embedUrl = "https://www.instagram.com/p/ABC123/";
    expect(instagramEmbedUrl(ig)).toBe("https://www.instagram.com/p/ABC123/embed");
  });
});
