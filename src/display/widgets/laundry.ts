import type { LaundryAppliance, LaundryData } from "@/lib/display/types";

import { subscribe } from "../api";
import { fill, h } from "../dom";
import { fmt } from "../format";
import type { Mount } from "./types";

// Washer and dryer (Melvin, 2026-11-25): one row per machine with time left, or "Done" from the end of a cycle until
// the next starts. The server works out done (src/server/laundry.ts); the wall only counts minutes down between reads.
const EVERY = 30_000;
const ICON: Record<LaundryAppliance["kind"], string> = { washer: "🫧", dryer: "♨️", combo: "🫧" };

const mins = (ms: number) => Math.max(0, Math.round(ms / 60_000));
const span = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`);

export const laundry: Mount<"laundry"> = (el, w, ctx) => {
  const root = h("div", { class: "w-laundry" }, h("div", { class: "w-empty" }, "Loading laundry…"));
  el.append(root);
  const at = fmt(ctx.timeZone, { hour: "numeric", minute: "2-digit", hour12: ctx.hour12 });
  let data: LaundryData | null = null;

  const row = (a: LaundryAppliance, now: number) => {
    let status: string;
    let detail = "";
    if (a.state === "running" || a.state === "paused") {
      const left = a.endsAt !== undefined ? mins(a.endsAt - now) : null;
      status = a.state === "paused" ? "Paused" : (a.phase ?? "Running");
      if (left !== null) {
        status += ` · ${span(left)} left`;
        if (a.state === "running" && a.endsAt !== undefined) detail = `Done about ${at.format(a.endsAt)}`;
      }
    } else if (a.state === "done") {
      status = "Done";
      if (a.doneAt !== undefined) {
        const ago = mins(now - a.doneAt);
        detail = ago < 1 ? "Just finished" : `Finished ${at.format(a.doneAt)} · ${span(ago)} ago`;
      }
    } else status = a.state === "error" ? "Needs attention" : a.state === "off" ? "Off" : "Idle";
    return h(
      "div",
      { class: `ld-m ld-${a.state}` },
      h("span", { class: "ld-icon", "aria-hidden": "true" }, ICON[a.kind]),
      h(
        "div",
        { class: "ld-body" },
        h("div", { class: "ld-name" }, a.name),
        h("div", { class: "ld-status" }, status),
        detail ? h("div", { class: "ld-detail" }, detail) : null,
        a.progress !== undefined && a.state !== "done"
          ? h("div", { class: "ld-bar" }, h("span", { style: `transform:scaleX(${a.progress / 100})` }))
          : null,
      ),
    );
  };

  const draw = () => {
    const d = data;
    if (!d) return;
    const label = w.title ? h("div", { class: "w-label" }, w.title) : null;
    if (!d.configured) return fill(root, label, h("div", { class: "w-empty" }, "Connect LG ThinQ or SmartThings in Settings › Laundry"));
    const picked = w.appliances.length ? d.appliances.filter((a) => w.appliances.includes(a.id)) : d.appliances;
    const shown = w.showIdle ? picked : picked.filter((a) => a.state !== "idle" && a.state !== "off");
    const now = Date.now();
    if (!shown.length)
      return fill(
        root,
        label,
        h("div", { class: "w-empty" }, picked.length ? "Nothing running" : (d.error ?? "No washers or dryers found")),
      );
    fill(
      root,
      label,
      h("div", { class: "ld-list" }, ...shown.map((a) => row(a, now))),
      d.stale ? h("div", { class: "ld-old" }, "Last known status") : null,
    );
  };

  const stop = subscribe<LaundryData>("laundry", EVERY, (d) => {
    data = d;
    draw();
  });
  // Count the minutes down between reads.
  const tick = window.setInterval(draw, 20_000);
  return () => {
    window.clearInterval(tick);
    stop();
  };
};
