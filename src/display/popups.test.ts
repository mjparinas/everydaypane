// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BoardMessage } from "@/lib/display/types";

let feed: ((d: { messages: BoardMessage[] }) => void) | null = null;
/** What the server remembers for this screen; null answers as if the server were out of reach. */
let server: { since: number; dismissed: string[] } | null = null;
const sent: unknown[] = [];
vi.mock("./api", () => ({
  subscribe: (_name: string, _every: number, cb: (d: { messages: BoardMessage[] }) => void) => {
    feed = cb;
    return () => undefined;
  },
  get: () => Promise.resolve({ data: server, live: server !== null }),
  send: (_path: string, body: unknown) => {
    sent.push(body);
    return Promise.resolve(true);
  },
}));

const { messagePopups, popupsDue, MAX_SHOWN } = await import("./popups");

function note(id: string, createdAt: number, over: Partial<BoardMessage> = {}): BoardMessage {
  return { id, author: "Sam", text: `Note ${id}`, colour: "pink", pinned: false, createdAt, ...over };
}

/** Lets the screen hear back from the (stand-in) server. */
const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

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
    server = null;
    sent.length = 0;
  });

  it("pops nothing already on the board, then stacks new notes with the newest by the corner", async () => {
    const onNew = vi.fn();
    const { el } = messagePopups(onNew);
    document.body.append(el);
    feed!({ messages: [note("old", 100)] });
    await flush();
    expect(texts(el)).toEqual([]);
    feed!({ messages: [note("b", 300), note("a", 200), note("old", 100)] });
    expect(texts(el)).toEqual(["Note a", "Note b"]);
    expect(el.querySelector(".pop")?.classList.contains("msg-pink")).toBe(true);
    expect(el.querySelector(".pop-from")?.textContent).toBe("Sam");
    expect(onNew).toHaveBeenCalledTimes(1);
    el.remove();
  });

  it("dismissing one leaves the others, and it stays dismissed after a reload", async () => {
    const first = messagePopups();
    feed!({ messages: [] });
    await flush();
    feed!({ messages: [note("a", 200), note("b", 300)] });
    (first.el.querySelector(".pop-dismiss") as HTMLButtonElement).click();
    expect(texts(first.el)).toEqual(["Note b"]);
    // A reload: a new stack reads what this screen remembered.
    const again = messagePopups();
    feed!({ messages: [note("a", 200), note("b", 300)] });
    await flush();
    expect(texts(again.el)).toEqual(["Note b"]);
  });

  it("shows the newest few and counts the rest, which come up as room is made", async () => {
    const { el } = messagePopups();
    feed!({ messages: [] });
    await flush();
    const many = Array.from({ length: MAX_SHOWN + 2 }, (_, i) => note(`n${i}`, 100 + i));
    feed!({ messages: many });
    expect(texts(el)).toHaveLength(MAX_SHOWN);
    expect(el.querySelector(".pop-more")?.textContent).toBe("+2 More");
    (el.querySelector(".pop-dismiss") as HTMLButtonElement).click();
    expect(texts(el)).toHaveLength(MAX_SHOWN);
    expect(texts(el)[0]).toBe("Note n1");
    expect(el.querySelector(".pop-more")?.textContent).toBe("+1 More");
  });

  it("takes a note down when it's deleted from the board", async () => {
    const { el } = messagePopups();
    feed!({ messages: [] });
    await flush();
    feed!({ messages: [note("a", 200)] });
    feed!({ messages: [] });
    expect(texts(el)).toEqual([]);
  });

  it("fades a dismissed note before taking it out when motion is allowed", async () => {
    window.matchMedia = (() => ({ matches: false })) as unknown as typeof window.matchMedia;
    const { el } = messagePopups();
    feed!({ messages: [] });
    await flush();
    feed!({ messages: [note("a", 200), note("b", 300)] });
    (el.querySelector(".pop-dismiss") as HTMLButtonElement).click();
    expect(el.querySelectorAll(".pop.leaving")).toHaveLength(1);
    vi.advanceTimersByTime(300);
    expect(el.querySelectorAll(".pop")).toHaveLength(1);
  });

  it("forgets this screen's place when switched off", async () => {
    const { stop } = messagePopups();
    feed!({ messages: [note("a", 200)] });
    await flush();
    expect(localStorage.getItem("ep-popups-since")).toBe("200");
    stop();
    expect(localStorage.getItem("ep-popups-since")).toBeNull();
  });
  it("keeps this screen's notes up after a reload that lost the browser's storage", async () => {
    // The server remembers where this screen started and what was dismissed on it.
    server = { since: 100, dismissed: ["a"] };
    const { el } = messagePopups();
    feed!({ messages: [note("a", 200), note("b", 300), note("old", 100)] });
    await vi.waitFor(() => expect(texts(el)).toEqual(["Note b"]));
  });

  it("tells the server about a dismissal on this screen", async () => {
    server = { since: 100, dismissed: [] };
    const { el } = messagePopups();
    feed!({ messages: [note("a", 200)] });
    await vi.waitFor(() => expect(texts(el)).toEqual(["Note a"]));
    (el.querySelector(".pop-dismiss") as HTMLButtonElement).click();
    expect(sent).toEqual([{ dismiss: "a" }]);
    expect(texts(el)).toEqual([]);
  });
});
