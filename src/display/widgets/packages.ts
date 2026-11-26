import type { PackagesData, PackageTrack } from "@/lib/display/types";
import { CARRIER_NAMES, deliveredEarlier, etaWhen, isToday, sortPackages } from "@/lib/packages";

import { subscribe } from "../api";
import { fill, h } from "../dom";
import { fmt } from "../format";
import type { Mount } from "./types";

// Packages (live status Melvin, 2026-11-26: "package tracking for today's deliveries"): today's deliveries first, with
// a count at the top, then what's on its way by expected day. The feed is 17TRACK through our server, every 15 minutes.
const EVERY = 5 * 60_000;

const STATUS: Record<PackageTrack["status"], string> = {
  unknown: "Waiting for an update",
  preTransit: "Label Created",
  inTransit: "On Its Way",
  outForDelivery: "Out for Delivery",
  pickup: "Ready for Pickup",
  delivered: "Delivered",
  exception: "Needs a Look",
};

export const packages: Mount<"packages"> = (el, w, ctx) => {
  const root = h("div", { class: "w-packages" }, h("div", { class: "w-empty" }, "Checking packages…"));
  el.append(root);
  const time = fmt(ctx.timeZone, { hour: "numeric", minute: "2-digit", hour12: ctx.hour12 });
  const day = fmt(ctx.timeZone, { weekday: "short", month: "short", day: "numeric" });
  const weekday = fmt(ctx.timeZone, { weekday: "long" });
  let data: PackagesData | null = null;

  /** "Arriving Today", "Expected Thursday" or "Delivered 2:14 PM", from the carrier's own dates. */
  function when(p: PackageTrack, now: number): string {
    if (p.status === "delivered")
      return p.deliveredAt === undefined
        ? ""
        : isToday(p, now, ctx.timeZone)
          ? `Delivered ${time.format(p.deliveredAt)}`
          : `Delivered ${day.format(p.deliveredAt)}`;
    if (p.status === "outForDelivery" || p.status === "pickup") return "";
    const eta = p.etaFrom ?? p.etaTo;
    if (eta === undefined) return "";
    const w = etaWhen(p, now, ctx.timeZone);
    if (w === "today") return "Arriving Today";
    if (w === "late") return `Was due ${day.format(p.etaTo ?? eta)}`;
    const days = (eta - now) / 86_400_000;
    const name = days < 6 ? weekday.format(eta) : day.format(eta);
    return p.etaTo !== undefined && p.etaTo !== eta ? `Expected ${day.format(eta)} – ${day.format(p.etaTo)}` : `Expected ${name}`;
  }

  function row(p: PackageTrack, now: number) {
    const title = p.label?.trim() || p.trackingNumber;
    const today = p.status !== "delivered" && isToday(p, now, ctx.timeZone);
    const due = when(p, now);
    const carrier = CARRIER_NAMES[p.carrier];
    return h(
      "li",
      { class: `pk-row pk-${p.status}${today ? " pk-today" : ""}` },
      h("span", { class: "pk-title" }, title),
      h("span", { class: "pk-status" }, STATUS[p.status]),
      h(
        "span",
        { class: "pk-summary" },
        [due, carrier, p.summary && p.summary !== STATUS[p.status] ? p.summary : "", p.where ?? ""].filter(Boolean).join(" · "),
      ),
    );
  }

  const draw = () => {
    if (!data) return;
    const now = Date.now();
    const mine = w.packages.map((p) => data?.packages.find((x) => x.id === p.id)).filter((p): p is PackageTrack => Boolean(p));
    const shown = sortPackages(mine, now, ctx.timeZone)
      .filter((p) => w.showDelivered || !deliveredEarlier(p, now, ctx.timeZone))
      .filter((p) => !w.todayOnly || isToday(p, now, ctx.timeZone));
    const coming = mine.filter((p) => p.status !== "delivered" && isToday(p, now, ctx.timeZone)).length;
    const head = data.trackingConfigured
      ? coming
        ? `${coming} ${coming === 1 ? "delivery" : "deliveries"} today`
        : "No deliveries today"
      : "";
    const hint = data.error ?? (data.trackingConfigured ? "" : "Add a 17TRACK key in Settings › Packages for live status.");
    if (!shown.length)
      return fill(
        root,
        w.title ? h("div", { class: "w-label" }, w.title) : null,
        h(
          "div",
          { class: "w-empty" },
          !mine.length ? "No packages to show." : w.todayOnly ? "Nothing arriving today." : "Nothing on its way.",
        ),
        hint ? h("div", { class: "pk-hint" }, hint) : null,
      );
    fill(
      root,
      w.title || head ? h("div", { class: "w-label" }, [w.title, head].filter(Boolean).join(" · ")) : null,
      hint ? h("div", { class: "pk-hint" }, hint) : null,
      h("ul", { class: "pk-list" }, ...shown.slice(0, w.count).map((p) => row(p, now))),
    );
  };

  // Redraw at least every few minutes even without new data, so "Arriving Today" turns over at midnight.
  const tick = window.setInterval(draw, 5 * 60_000);
  const stop = subscribe<PackagesData>("packages", EVERY, (d) => {
    data = d;
    draw();
  });
  return () => {
    window.clearInterval(tick);
    stop();
  };
};
