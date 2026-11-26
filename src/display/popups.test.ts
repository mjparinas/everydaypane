// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BoardMessage } from "@/lib/display/types";

let feed: ((d: { messages: BoardMessage[] }) => void) | null = null;
vi.mock("./api", () => ({
  subscribe: (_name: string, _every: number, cb: (d: { messages: BoardMessage[] }) => void) => {
    feed = cb;
    return () => undefined;
  },
}));

const { messagePopups, popupsDue, MAX_SHOWN } = await import("./popups");

function note(id: string, createdAt: number, over: Partial<BoardMessage> = {}): BoardMessage {
  return { id, author: "Sam", text: `Note ${id}`, colour: "pink", pinned: false, createdAt, ...over };
}

const texts = (el: HTMLElement) => [...el.querySelectorAll(".pop:not(.leaving) .pop-text")].map((n) => n.textContent);

describe("popupsDue", () => {
  it("keeps notes newer than the first look, not dismissed, oldest first", () => {
    const due = popupsDue([note("c", 30), note("a", 10), note("b", 20)], 10, new Set(["c"]));
    expect(due.map((m) => m.id)).toEqual(["b"]);
  });
});

describe("messagePopups", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    // No motion here, so removals happen at once.
    window.matchMedia = ((q: string) => ({ matches: q.includes("reduce") })) as unknown as typeof window.matchMedia;
  });
  afterEach(() => {
    vi.useRealTimers();
    feed = null;
  });

  it("pops nothing already on the board, then stacks new notes with the newest by the corner", () => {
    const onNew = vi.fn();
    const { el } = messagePopups(onNew);
    document.body.append(el);
    feed!({ messages: [note("old", 100)] });
    expect(texts(el)).toEqual([]);
    feed!({ messages: [note("b", 300), note("a", 200), note("old", 100)] });
    expect(texts(el)).toEqual(["Note a", "Note b"]);
    expect(el.querySelector(".pop")?.classList.contains("msg-pink")).toBe(true);
    expect(el.querySelector(".pop-from")?.textContent).toBe("Sam");
    expect(onNew).toHaveBeenCalledTimes(1);
    el.remove();
  });

  it("dismissing one leaves the others, and it stays dismissed after a reload", () => {
    const first = messagePopups();
    feed!({ messages: [] });
    feed!({ messages: [note("a", 200), note("b", 300)] });
    (first.el.querySelector(".pop-dismiss") as HTMLButtonElement).click();
    expect(texts(first.el)).toEqual(["Note b"]);
    // A reload: a new stack reads what this screen remembered.
    const again = messagePopups();
    feed!({ messages: [note("a", 200), note("b", 300)] });
    expect(texts(again.el)).toEqual(["Note b"]);
  });

  it("shows the newest few and counts the rest, which come up as room is made", () => {
    const { el } = messagePopups();
    feed!({ messages: [] });
    const many = Array.from({ length: MAX_SHOWN + 2 }, (_, i) => note(`n${i}`, 100 + i));
    feed!({ messages: many });
    expect(texts(el)).toHaveLength(MAX_SHOWN);
    expect(el.querySelector(".pop-more")?.textContent).toBe("+2 More");
    (el.querySelector(".pop-dismiss") as HTMLButtonElement).click();
    expect(texts(el)).toHaveLength(MAX_SHOWN);
    expect(texts(el)[0]).toBe("Note n1");
    expect(el.querySelector(".pop-more")?.textContent).toBe("+1 More");
  });

  it("takes a note down when it's deleted from the board", () => {
    const { el } = messagePopups();
    feed!({ messages: [] });
    feed!({ messages: [note("a", 200)] });
    feed!({ messages: [] });
    expect(texts(el)).toEqual([]);
  });

  it("fades a dismissed note before taking it out when motion is allowed", () => {
    window.matchMedia = (() => ({ matches: false })) as unknown as typeof window.matchMedia;
    const { el } = messagePopups();
    feed!({ messages: [] });
    feed!({ messages: [note("a", 200), note("b", 300)] });
    (el.querySelector(".pop-dismiss") as HTMLButtonElement).click();
    expect(el.querySelectorAll(".pop.leaving")).toHaveLength(1);
    vi.advanceTimersByTime(300);
    expect(el.querySelectorAll(".pop")).toHaveLength(1);
  });

  it("forgets this screen's place when switched off", () => {
    const { stop } = messagePopups();
    feed!({ messages: [note("a", 200)] });
    expect(localStorage.getItem("ep-popups-since")).toBe("200");
    stop();
    expect(localStorage.getItem("ep-popups-since")).toBeNull();
  });
});
