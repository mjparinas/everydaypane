import type { PackagesData, PackageTrack } from "@/lib/display/types";

import { subscribe } from "../api";
import { fill, h } from "../dom";
import type { Mount } from "./types";

const EVERY = 5 * 60_000;

const STATUS: Record<PackageTrack["status"], string> = {
  unknown: "Status unknown",
  preTransit: "Label created",
  inTransit: "In transit",
  outForDelivery: "Out for delivery",
  delivered: "Delivered",
  exception: "Exception",
};

function row(p: PackageTrack) {
  const title = p.label?.trim() || p.trackingNumber;
  return h(
    "li",
    { class: `pk-row pk-${p.status}` },
    h("span", { class: "pk-title" }, title),
    h("span", { class: "pk-carrier" }, p.carrier),
    h("span", { class: "pk-status" }, STATUS[p.status]),
    p.summary ? h("span", { class: "pk-summary" }, p.summary) : null,
  );
}

export const packages: Mount<"packages"> = (el, w, ctx) => {
  void ctx;
  const root = h("div", { class: "w-packages" }, h("div", { class: "w-empty" }, "Checking packages…"));
  el.append(root);
  let data: PackagesData | null = null;

  const draw = () => {
    if (!data) return;
    const fromWidget = w.packages
      .map((p) => data?.packages.find((x) => x.id === p.id))
      .filter((p): p is PackageTrack => Boolean(p))
      .filter((p) => w.showDelivered || p.status !== "delivered")
      .slice(0, w.count);
    if (!fromWidget.length) return fill(root, h("div", { class: "w-empty" }, "No packages to show."));
    fill(
      root,
      w.title ? h("div", { class: "w-label" }, w.title) : null,
      !data.trackingConfigured ? h("div", { class: "pk-hint" }, "Add PACKAGE_TRACK_API_KEY for live tracking.") : null,
      h("ul", { class: "pk-list" }, ...fromWidget.map(row)),
    );
  };

  return subscribe<PackagesData>("packages", EVERY, (d) => {
    data = d;
    draw();
  });
};
