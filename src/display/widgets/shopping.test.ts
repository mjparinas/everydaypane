// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { newWidget } from "@/lib/config/widgets";
import type { DisplayPayload, ShoppingData } from "@/lib/display/types";

import { shopping, shownItems } from "./shopping";

const ctx = { payload: {} as DisplayPayload, timeZone: "America/Vancouver", hour12: true };
const data: ShoppingData = {
  updatedAt: 1,
  items: [
    { id: "a", text: "Milk", done: false },
    { id: "b", text: "Eggs", done: false },
    { id: "c", text: "Bread", done: true },
  ],
};

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe("shopping widget", () => {
  it("shows open items first and hides bought ones unless asked", () => {
    expect(shownItems(data, 12, false).map((i) => i.text)).toEqual(["Milk", "Eggs"]);
    expect(shownItems(data, 12, true).map((i) => i.text)).toEqual(["Milk", "Eggs", "Bread"]);
    expect(shownItems(data, 1, false).map((i) => i.text)).toEqual(["Milk"]);
    const ticked = shownItems(data, 12, true, new Map([["a", true]]));
    expect(ticked.map((i) => [i.text, i.done])).toEqual([
      ["Eggs", false],
      ["Milk", true],
      ["Bread", true],
    ]);
  });

  it("ticks an item off at once, and a second tap puts it back when bought items stay visible", async () => {
    vi.useFakeTimers();
    const posts: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: RequestInit) => {
        if (init?.method === "POST") {
          posts.push(JSON.parse(String(init.body)));
          return Promise.resolve(Response.json({ ok: true }));
        }
        return Promise.resolve(Response.json(data));
      }),
    );
    const el = document.createElement("div");
    const widget = { ...newWidget("shopping", "s", { x: 0, y: 0 }), showDone: true, count: 2 };
    const stop = shopping(el, widget, ctx);
    await vi.advanceTimersByTimeAsync(0);
    expect([...el.querySelectorAll(".sh-title")].map((n) => n.textContent)).toEqual(["Milk", "Eggs"]);
    expect(el.querySelector(".sh-more")?.textContent).toBe("1 more");

    el.querySelector<HTMLButtonElement>('[data-id="a"] button')?.click();
    expect([...el.querySelectorAll(".sh-title")].map((n) => n.textContent)).toEqual(["Eggs", "Milk"]);
    expect(el.querySelector('[data-id="a"]')?.classList.contains("sh-done")).toBe(true);
    el.querySelector<HTMLButtonElement>('[data-id="a"] button')?.click();
    expect(el.querySelector('[data-id="a"]')?.classList.contains("sh-done")).toBe(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(posts).toEqual([
      { id: "a", done: true },
      { id: "a", done: false },
    ]);
    stop();
  });

  it("says the list is clear when everything is bought and bought items are hidden", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(Response.json({ updatedAt: 1, items: [{ id: "a", text: "Milk", done: true }] }))),
    );
    const el = document.createElement("div");
    const stop = shopping(el, newWidget("shopping", "s", { x: 0, y: 0 }), ctx);
    await vi.advanceTimersByTimeAsync(0);
    expect(el.querySelector(".w-empty")?.textContent).toBe("All bought");
    stop();
  });
});
