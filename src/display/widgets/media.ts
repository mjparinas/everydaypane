import { F } from "@/lib/display/mediaFeatures";
import type { HaData, HaEntity, HaMedia, MusicData } from "@/lib/display/types";

import { imageUrl, refresh, sendExplained, subscribe } from "../api";
import { fill, h, setText, svg } from "../dom";
import { HA_EVERY } from "./ha";
import type { Mount } from "./types";

// Music (Melvin, 2026-11-17): a Sonos speaker or Spotify, as a Home Assistant media_player. What's playing, play/pause,
// skip, volume, and the player's sources (Sonos favourites, or the Spotify Connect speakers to play on). States come
// from the shared Home Assistant feed, or for Spotify and Sonos signed in directly (Melvin, 2026-11-18) from the
// shared music feed, which describes its players the same way; the progress bar moves on its own between polls.

export { F };
export const MUSIC_EVERY = 5000;

interface Source {
  feed: string;
  every: number;
  /** The player's key in its feed, and in taps and art requests. */
  key: string;
  label: string;
  art: (k: string) => Record<string, string>;
  tap: (action: string, extra: { value?: number; option?: string }) => Record<string, unknown>;
  /** The player from a feed answer, or what to say instead. */
  pick: (d: unknown) => HaEntity | string;
}

/** Where a widget's player comes from: Home Assistant, or Spotify or Sonos directly. Null when none is picked. */
export function sourceFor(w: { provider: "homeAssistant" | "spotify" | "sonos"; entityId: string; playerId: string }): Source | null {
  if (w.provider === "homeAssistant") {
    if (!w.entityId.startsWith("media_player.")) return null;
    return {
      feed: "ha",
      every: HA_EVERY,
      key: w.entityId,
      label: "Home Assistant",
      art: (k) => ({ e: w.entityId, k }),
      tap: (action, extra) => ({ entity: w.entityId, action, ...extra }),
      pick: (raw) => {
        const d = raw as HaData;
        if (!d.configured) return "Set up Home Assistant under Settings in the admin panel.";
        return d.entities[w.entityId] ?? `${w.entityId} wasn't found`;
      },
    };
  }
  if (w.provider === "sonos" && !w.playerId) return null;
  const key = w.provider === "spotify" ? "spotify" : `sonos:${w.playerId}`;
  const label = w.provider === "spotify" ? "Spotify" : "Sonos";
  const service = w.provider;
  return {
    feed: "music",
    every: MUSIC_EVERY,
    key,
    label,
    art: (k) => ({ p: key, k }),
    tap: (action, extra) => ({ player: key, action, ...extra }),
    pick: (raw) => {
      const d = raw as MusicData;
      const s = d.services[service];
      if (!s?.connected) return `Connect ${label} under Settings in the admin panel.`;
      return d.players[key] ?? s.error ?? "Loading…";
    },
  };
}

const icon = (d: string) => `<svg viewBox="0 0 24 24" fill="currentColor"><path d="${d}"/></svg>`;
const PLAY = icon("M8 5.5v13l10.5-6.5z");
const PAUSE = icon("M7 5h3.5v14H7zm6.5 0H17v14h-3.5z");
const NEXT = icon("M6 6v12l8.5-6zm9.5 0H18v12h-2.5z");
const PREV = icon("M18 6v12l-8.5-6zM6 6h2.5v12H6z");
const SPEAKER = icon("M4 9v6h4l5 4V5L8 9zm12.5 3A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4z");
const MUTED = icon("M4 9v6h4l5 4V5L8 9zm12.6-.4L15.2 10l2 2-2 2 1.4 1.4 2-2 2 2 1.4-1.4-2-2 2-2-1.4-1.4-2 2z");

const has = (m: HaMedia, bit: number) => (m.features & bit) !== 0;

/** Where the track is now, in seconds: the last reading plus the time since, while playing. */
export function positionNow(e: HaEntity, now: number): number | null {
  const m = e.media;
  if (!m?.duration || m.position === undefined) return null;
  const since = e.state === "playing" && m.positionAt ? (now - m.positionAt) / 1000 : 0;
  return Math.min(m.duration, Math.max(0, m.position + since));
}

/** A player with nothing on it says so rather than showing an empty title. */
export function nowPlaying(e: HaEntity): { title: string; detail: string } {
  const m = e.media;
  if (e.state === "unavailable" || e.state === "unknown") return { title: "Unavailable", detail: "" };
  if (e.state === "off" || !m?.title) return { title: "Nothing playing", detail: m?.source ?? "" };
  return { title: m.title, detail: [m.artist, m.album].filter(Boolean).join(" · ") };
}

export const media: Mount<"media"> = (el, w) => {
  const src = sourceFor(w);
  if (!src) {
    el.append(h("div", { class: "w-empty" }, "Pick a Sonos or Spotify player for this widget."));
    return () => undefined;
  }
  const root = h("div", { class: "w-media", hidden: true });
  const empty = h("div", { class: "w-empty" }, "Loading…");
  el.append(root, empty);

  const art = h("img", { class: "mp-art", alt: "" });
  const artBox = h("div", { class: "mp-artbox" }, art);
  const name = h("div", { class: "w-label" });
  const title = h("div", { class: "mp-title" });
  const detail = h("div", { class: "mp-detail" });
  const bar = h("div", { class: "mp-bar" });
  const track = h("div", { class: "mp-track" }, bar);
  const btn = (markup: string, label: string, cls = "mp-btn") => {
    const b = h("button", { type: "button", class: cls, "aria-label": label });
    b.append(svg(markup));
    return b;
  };
  const prev = btn(PREV, "Previous");
  const play = btn(PLAY, "Play", "mp-btn mp-play");
  const next = btn(NEXT, "Next");
  const mute = btn(SPEAKER, "Mute", "mp-btn mp-mute");
  const volume = h("input", { type: "range", class: "ha-range mp-volume", min: 0, max: 100, "aria-label": "Volume" });
  const sources = h("select", {
    class: "mp-sources",
    "aria-label": w.provider === "spotify" || w.entityId.includes("spotify") ? "Play on" : "Play",
  });
  const msg = h("div", { class: "ha-msg" });
  const controls = h("div", { class: "mp-controls" }, prev, play, next);
  const volumeRow = h("div", { class: "mp-row" }, mute, volume);
  art.addEventListener("error", () => artBox.classList.add("none"));
  art.addEventListener("load", () => artBox.classList.remove("none"));

  let entity: HaEntity | null = null;
  let artKey = "";
  let sourcesKey = "";
  let msgTimer: number | undefined;

  const act = async (action: string, extra: { value?: number; option?: string } = {}) => {
    const why = await sendExplained(src.feed, src.tap(action, extra));
    const ok = why === null;
    // Spotify says why it refused (no Premium, nothing playing anywhere), which helps more than "couldn't reach".
    setText(msg, ok ? "" : why || `Couldn't reach ${src.label}`);
    window.clearTimeout(msgTimer);
    if (!ok) msgTimer = window.setTimeout(() => setText(msg, ""), 4000);
    window.setTimeout(() => refresh(src.feed), 500);
  };
  play.addEventListener("click", () => {
    // Show the change at once; the next poll confirms it.
    if (entity) {
      entity = { ...entity, state: entity.state === "playing" ? "paused" : "playing" };
      draw();
    }
    void act("playPause");
  });
  prev.addEventListener("click", () => void act("previous"));
  next.addEventListener("click", () => void act("next"));
  mute.addEventListener("click", () => void act(entity?.media?.muted ? "unmute" : "mute"));
  volume.addEventListener("change", () => void act("volume", { value: Number(volume.value) }));
  sources.addEventListener("change", () => {
    if (sources.value) void act("source", { option: sources.value });
  });

  const moveBar = () => {
    const p = entity ? positionNow(entity, Date.now()) : null;
    const d = entity?.media?.duration;
    track.hidden = p === null || !d;
    if (p !== null && d) bar.style.transform = `scaleX(${(p / d).toFixed(4)})`;
  };

  const draw = () => {
    const e = entity;
    if (!e) return;
    const m: HaMedia = e.media ?? { features: 0 };
    const dead = e.state === "unavailable" || e.state === "unknown";
    const playing = e.state === "playing";
    const said = nowPlaying(e);
    root.classList.toggle("dead", dead);
    root.classList.toggle("playing", playing);
    setText(name, w.title || e.name);
    setText(title, said.title);
    setText(detail, said.detail);

    const key = w.showArt && m.art && m.title ? m.art : "";
    if (key !== artKey) {
      artKey = key;
      artBox.classList.toggle("none", !key);
      if (key) art.src = imageUrl("art", src.art(key));
      else art.removeAttribute("src");
    }

    play.replaceChildren(svg(playing ? PAUSE : PLAY));
    play.setAttribute("aria-label", playing ? "Pause" : "Play");
    play.disabled = dead || !has(m, playing ? F.pause : F.play);
    prev.hidden = !has(m, F.previous);
    next.hidden = !has(m, F.next);
    prev.disabled = next.disabled = dead || !m.title;

    volumeRow.hidden = !w.showVolume || m.volume === undefined || !has(m, F.volumeSet);
    if (m.volume !== undefined && document.activeElement !== volume) volume.value = String(Math.round(m.volume * 100));
    mute.hidden = !has(m, F.mute);
    mute.replaceChildren(svg(m.muted ? MUTED : SPEAKER));
    mute.setAttribute("aria-label", m.muted ? "Unmute" : "Mute");

    const list = w.showSources && has(m, F.source) ? (m.sources ?? []) : [];
    sources.hidden = !list.length;
    const sk = `${list.join("\n")}|${m.source ?? ""}`;
    if (sk !== sourcesKey && document.activeElement !== sources) {
      sourcesKey = sk;
      const current = m.source && list.includes(m.source) ? m.source : "";
      fill(
        sources,
        h("option", { value: "", selected: !current }, sources.getAttribute("aria-label") + "…"),
        ...list.map((s) => h("option", { value: s, selected: s === current }, s)),
      );
    }
    moveBar();
  };

  fill(root, artBox, h("div", { class: "mp-body" }, name, title, detail, track, controls, volumeRow, sources, msg));

  const stop = subscribe<unknown>(src.feed, src.every, (d) => {
    const picked = src.pick(d);
    const e = typeof picked === "string" ? null : picked;
    root.hidden = !e;
    empty.hidden = Boolean(e);
    if (typeof picked === "string") setText(empty, picked);
    entity = e;
    draw();
  });
  // The progress bar moves every second while playing; transform only, so no layout.
  const tick = window.setInterval(() => {
    if (entity?.state === "playing" && !document.hidden) moveBar();
  }, 1000);
  return () => {
    stop();
    window.clearInterval(tick);
    window.clearTimeout(msgTimer);
  };
};
