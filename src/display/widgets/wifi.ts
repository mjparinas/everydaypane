import { imageUrl } from "../api";
import { h } from "../dom";
import type { Mount } from "./types";

export const wifiQr: Mount<"wifiQr"> = (el, w) => {
  el.append(
    h(
      "div",
      { class: "w-wifi" },
      h("img", { class: "wifi-qr", src: imageUrl("qr", { w: w.id }), alt: `QR code to join ${w.ssid}`, decoding: "async" }),
      h(
        "div",
        { class: "wifi-text" },
        h("div", { class: "w-label" }, w.title || "Join Wi-Fi"),
        h("div", { class: "wifi-ssid" }, w.ssid),
        w.showPassword && w.password ? h("div", { class: "w-sub" }, w.password) : null,
      ),
    ),
  );
  return () => undefined;
};
