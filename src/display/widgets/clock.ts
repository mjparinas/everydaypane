import { h, setText } from "../dom";
import { clockParts, fuzzyTime } from "../format";
import { everySecond } from "../ticker";
import type { Mount } from "./types";

// Clock styles (Melvin, 2026-11-23): digital/analog plus flip, nixie, word, minimal and neon — CSS-light, no assets.

function digitCard(ch: string) {
  return h("span", { class: "c-flip-d", "data-d": ch }, h("i", { class: "c-flip-a" }, ch), h("i", { class: "c-flip-b" }, ch));
}

function setFlip(root: HTMLElement, text: string) {
  const cards = [...root.querySelectorAll<HTMLElement>(".c-flip-d")];
  const chars = text.replace(/[^0-9]/g, "").padStart(cards.length, "0").slice(-cards.length);
  cards.forEach((card, i) => {
    const next = chars[i] ?? "0";
    if (card.dataset.d === next) return;
    card.dataset.d = next;
    const a = card.querySelector(".c-flip-a");
    const b = card.querySelector(".c-flip-b");
    if (a) setText(a, next);
    if (b) setText(b, next);
    // Restart the flap animation when the digit changes (CSS no-ops under prefers-reduced-motion).
    card.classList.remove("c-flip-go");
    void card.offsetWidth;
    card.classList.add("c-flip-go");
  });
}

export const clock: Mount<"clock"> = (el, w, ctx) => {
  const label = w.label ? h("div", { class: "w-label" }, w.label) : null;
  if (w.style === "analog") {
    const face = h("div", { class: "analog" });
    face.innerHTML = `<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="47" class="a-face"/>${Array.from(
      { length: 12 },
      (_, i) => `<line x1="50" y1="7" x2="50" y2="${i % 3 ? 11 : 14}" class="a-tick" transform="rotate(${i * 30} 50 50)"/>`,
    ).join(
      "",
    )}<line x1="50" y1="50" x2="50" y2="26" class="a-hour"/><line x1="50" y1="50" x2="50" y2="14" class="a-min"/><line x1="50" y1="58" x2="50" y2="12" class="a-sec"/><circle cx="50" cy="50" r="2.5" class="a-pin"/></svg>`;
    const [hour, min, sec] = ["a-hour", "a-min", "a-sec"].map((c) => face.querySelector<SVGLineElement>(`.${c}`));
    el.append(h("div", { class: "w-clock analog-wrap" }, face, label));
    return everySecond((now) => {
      const p = clockParts(now, w.timeZone, false);
      hour?.setAttribute("transform", `rotate(${(p.hours % 12) * 30 + p.minutes * 0.5} 50 50)`);
      min?.setAttribute("transform", `rotate(${p.minutes * 6 + p.secs * 0.1} 50 50)`);
      if (sec) sec.style.display = w.showSeconds ? "" : "none";
      if (w.showSeconds) sec?.setAttribute("transform", `rotate(${p.secs * 6} 50 50)`);
    });
  }

  if (w.style === "word") {
    const line = h("div", { class: "c-word" });
    el.append(h("div", { class: "w-clock" }, line, label));
    return everySecond((now) => {
      const p = clockParts(now, w.timeZone, false);
      setText(line, fuzzyTime(p.hours, p.minutes));
    });
  }

  if (w.style === "flip") {
    const digits = h(
      "div",
      { class: "c-flip" },
      digitCard("0"),
      digitCard("0"),
      h("span", { class: "c-flip-colon" }, ":"),
      digitCard("0"),
      digitCard("0"),
      ...(w.showSeconds
        ? [h("span", { class: "c-flip-colon" }, ":"), digitCard("0"), digitCard("0")]
        : []),
    );
    const ampm = ctx.hour12 ? h("span", { class: "c-ampm" }) : null;
    el.append(h("div", { class: "w-clock" }, digits, ampm, label));
    return everySecond((now) => {
      const p = clockParts(now, w.timeZone, ctx.hour12);
      const raw = w.showSeconds ? `${p.hm}${p.seconds}` : p.hm;
      setFlip(digits, raw);
      if (ampm) setText(ampm, p.ampm);
    });
  }

  const styleClass =
    w.style === "nixie" ? "c-nixie" : w.style === "neon" ? "c-neon" : w.style === "minimal" ? "c-minimal" : "";
  const hm = h("span", { class: "c-hm" });
  const s = w.showSeconds ? h("span", { class: "c-s" }) : null;
  const ampm = ctx.hour12 && w.style !== "minimal" ? h("span", { class: "c-ampm" }) : null;
  el.append(h("div", { class: `w-clock${styleClass ? ` ${styleClass}` : ""}` }, h("div", { class: "c-time" }, hm, s, ampm), label));
  return everySecond((now) => {
    const p = clockParts(now, w.timeZone, ctx.hour12);
    setText(hm, p.hm);
    if (s) setText(s, p.seconds);
    if (ampm) setText(ampm, p.ampm);
  });
};
