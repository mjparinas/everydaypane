import { imageUrl } from "../api";
import { h } from "../dom";
import type { Mount } from "./types";

export const editQr: Mount<"editQr"> = (el, w) => {
  el.append(
    h(
      "div",
      { class: "w-wifi" },
      h("img", {
        class: "wifi-qr",
        src: imageUrl("qr", { w: w.id }),
        alt: "QR code to edit meals, shopping and messages on your phone",
        decoding: "async",
      }),
      h(
        "div",
        { class: "wifi-text" },
        h("div", { class: "w-label" }, w.title || "Edit on your phone"),
        h("div", { class: "w-sub" }, "Meals · shopping · messages"),
      ),
    ),
  );
  return () => undefined;
};
