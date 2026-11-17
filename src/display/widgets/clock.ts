import { h, setText } from "../dom";
import { clockParts } from "../format";
import { everySecond } from "../ticker";
import type { Mount } from "./types";

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
  const hm = h("span", { class: "c-hm" });
  const s = w.showSeconds ? h("span", { class: "c-s" }) : null;
  const ampm = ctx.hour12 ? h("span", { class: "c-ampm" }) : null;
  el.append(h("div", { class: "w-clock" }, h("div", { class: "c-time" }, hm, s, ampm), label));
  return everySecond((now) => {
    const p = clockParts(now, w.timeZone, ctx.hour12);
    setText(hm, p.hm);
    if (s) setText(s, p.seconds);
    if (ampm) setText(ampm, p.ampm);
  });
};
