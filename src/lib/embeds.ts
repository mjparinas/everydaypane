// Iframe embed addresses for Phase 5 widgets (Melvin, 2026-11-23). Built on the server and in the admin only; the
// display just loads the finished address.

import type { WidgetOf } from "./config/schema";

export function tradingViewUrl(w: WidgetOf<"tradingView">, dark: boolean): string {
  const theme = w.theme === "auto" ? (dark ? "dark" : "light") : w.theme;
  const p = new URLSearchParams({
    symbol: w.symbol.trim() || "TSX:RY",
    interval: w.interval,
    timezone: "America/Vancouver",
    theme,
    style: w.style,
    locale: "en",
    enable_publishing: "false",
    hide_top_toolbar: "true",
    hide_legend: "false",
    save_image: "false",
  });
  return `https://s.tradingview.com/widgetembed/?${p}`;
}

export function youtubeEmbedUrl(w: WidgetOf<"youtube">): string {
  const id = w.videoId.trim();
  if (!id) return "";
  if (w.mode === "playlist") return `https://www.youtube.com/embed/videoseries?list=${encodeURIComponent(id)}`;
  const p = new URLSearchParams({ rel: "0", modestbranding: "1" });
  if (w.autoplay) p.set("autoplay", "1");
  return `https://www.youtube.com/embed/${encodeURIComponent(id)}?${p}`;
}

export function vimeoEmbedUrl(w: WidgetOf<"vimeo">): string {
  const id = w.videoId.trim();
  if (!id) return "";
  const p = new URLSearchParams({ title: "0", byline: "0", portrait: "0" });
  if (w.autoplay) p.set("autoplay", "1");
  return `https://player.vimeo.com/video/${encodeURIComponent(id)}?${p}`;
}

export function mapsEmbedUrl(w: WidgetOf<"maps">): string {
  const q = w.query.trim() || "Langley, BC";
  return `https://www.google.com/maps?q=${encodeURIComponent(q)}&z=${w.zoom}&output=embed`;
}

/** Post or reel embed only — Instagram profile pages need Meta app review for the Graph API. */
export function instagramEmbedUrl(w: WidgetOf<"instagram">): string {
  const raw = w.embedUrl.trim();
  if (!raw) return "";
  try {
    const u = new URL(raw);
    if (!u.hostname.endsWith("instagram.com")) return "";
    const path = u.pathname.replace(/\/$/, "");
    if (path.includes("/embed")) return raw;
    return `${u.origin}${path}/embed`;
  } catch {
    return "";
  }
}
