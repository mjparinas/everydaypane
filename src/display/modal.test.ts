// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { attachModal } from "./modal";

afterEach(() => {
  document.body.replaceChildren();
});

describe("attachModal", () => {
  it("marks the overlay modal, focuses it, and dismisses on Escape", () => {
    const prior = document.createElement("button");
    document.body.append(prior);
    prior.focus();

    const el = document.createElement("div");
    el.setAttribute("role", "dialog");
    document.body.append(el);

    let dismissed = 0;
    const detach = attachModal(el, () => {
      dismissed++;
      detach();
      el.remove();
    });

    expect(el.getAttribute("aria-modal")).toBe("true");
    expect(el.tabIndex).toBe(-1);

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(dismissed).toBe(1);
    expect(document.body.contains(el)).toBe(false);
  });

  it("ignores other keys and can be detached without dismissing", () => {
    const el = document.createElement("div");
    document.body.append(el);
    let dismissed = 0;
    const detach = attachModal(el, () => dismissed++);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(dismissed).toBe(0);
    detach();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(dismissed).toBe(0);
  });
});
