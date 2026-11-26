import type { BoardMessage } from "@/lib/display/types";

import { get, send, subscribe } from "./api";
import { h } from "./dom";
import { everyMinute } from "./ticker";
import { ago } from "./widgets/messages";

// Message pop-ups (Melvin, 2026-11-26: "a toast message on the bottom right of the screen that stays up until somebody
// clicks the dismiss button … who sent it … customize the background colour … if a bunch of messages come in they
// stack up"). A new note on the family message board appears as a note in the bottom-right corner, in the colour its
// sender picked, and stays until someone taps Dismiss. Newer notes stack in at the bottom; dismissing one fades it and
// the ones above slide down into its place. The note itself stays on the message board.
//
// Claude's calls (2026-11-26): dismissing is per screen, only notes posted after this screen first saw the board pop
// up, so switching the mode on doesn't bury the wall in old notes, and a note deleted from a phone leaves the corner too.
//
// Durable per screen (Melvin, 2026-11-26: "if i refresh the page they should not go away … dismissed message on one
// screen, shouldnt impact the other"): the screen's starting point and dismissals live on the server under its display
// device (`/api/display/popups/`, src/server/popups.ts), because some wall browsers lose localStorage on a reload.
// localStorage is only this screen's copy, used until the server answers or when it can't.

const SINCE_KEY = "ep-popups-since";
const DISMISSED_KEY = "ep-popups-dismissed";
/** At most this many in the stack; the rest wait behind a "+N more" chip until room is made. */
export const MAX_SHOWN = 4;
const LEAVE_MS = 240;
const MOVE_MS = 360;

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Private mode or storage full: pop-ups just start over after a reload.
  }
}

/**
 * The notes that should be up, oldest first. `since` is the newest note this screen saw the first time it read the
 * board (server time, so a wall clock that runs fast can't hide a note); a note is up when it's newer and not dismissed.
 */
export function popupsDue(messages: BoardMessage[], since: number, dismissed: ReadonlySet<string>): BoardMessage[] {
  return messages.filter((m) => m.createdAt > since && !dismissed.has(m.id)).sort((a, b) => a.createdAt - b.createdAt);
}

const newestOf = (messages: BoardMessage[]) => messages.reduce((n, m) => Math.max(n, m.createdAt), 0);

const reduced = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

/** Starts the corner stack; `onNew` hears about each note the first time it pops up (the screen saver wakes for it). */
export function messagePopups(onNew?: () => void): { el: HTMLElement; stop: () => void } {
  const el = h("div", { class: "popups", role: "region", "aria-label": "New messages", "aria-live": "polite" });
  const more = h("div", { class: "pop-more" });
  el.append(more);
  const shown = new Map<string, { node: HTMLElement; time: HTMLElement; message: BoardMessage }>();
  const leaving = new Set<HTMLElement>();
  let since: number | null = read(SINCE_KEY) === null ? null : Number(read(SINCE_KEY));
  let dismissed = new Set<string>(
    ((): string[] => {
      try {
        return JSON.parse(read(DISMISSED_KEY) ?? "[]") as string[];
      } catch {
        return [];
      }
    })(),
  );
  let latest: BoardMessage[] = [];
  let fed = false;
  /** null until the server has answered once; then the server's word wins over this browser's copy. */
  let loading: Promise<void> | null = null;
  let fromServer = false;
  const remember = () => {
    if (since !== null) write(SINCE_KEY, String(since));
    write(DISMISSED_KEY, JSON.stringify([...dismissed].slice(-50)));
  };
  const load = () => {
    if (fromServer || loading) return;
    loading = get<{ since: number; dismissed: string[] }>("popups").then((r) => {
      loading = null;
      if (!r.data) {
        // 204 (not a display device) has nothing to load; out of reach tries again on the next board read. Either way
        // the screen carries on from its own copy, or from the board as it is now.
        if (r.live) fromServer = true;
        if (since === null && fed) {
          since = newestOf(latest);
          remember();
          draw();
        }
        return;
      }
      fromServer = true;
      since = r.data.since;
      // A dismissal made here while the server was out of reach is kept as well.
      dismissed = new Set([...r.data.dismissed, ...dismissed]);
      remember();
      if (fed) draw();
    });
  };

  /** Moves every note still in the stack from where it was to where it is now, so a gap closes by sliding. */
  const slide = (before: Map<HTMLElement, number>) => {
    if (reduced()) return;
    for (const [node, top] of before) {
      if (!node.isConnected || leaving.has(node)) continue;
      const dy = top - node.getBoundingClientRect().top;
      if (Math.abs(dy) < 0.5) continue;
      node.style.transition = "none";
      node.style.transform = `translateY(${dy}px)`;
      void node.offsetHeight;
      node.style.transition = `transform ${MOVE_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`;
      node.style.transform = "";
    }
  };
  const tops = () => new Map([...shown.values()].map((s) => [s.node, s.node.getBoundingClientRect().top] as const));

  const build = (m: BoardMessage) => {
    const time = h("span", { class: "pop-time" }, ago(Date.now() - m.createdAt));
    const dismiss = h("button", { type: "button", class: "pop-dismiss", "aria-label": `Dismiss note from ${m.author}` }, "Dismiss");
    const node = h(
      "article",
      { class: `pop msg-${m.colour}` },
      h("div", { class: "pop-head" }, h("span", { class: "pop-from" }, m.author), time),
      h("div", { class: "pop-text" }, m.text),
      dismiss,
    );
    dismiss.addEventListener("click", (ev) => {
      ev.stopPropagation();
      dismissed.add(m.id);
      write(DISMISSED_KEY, JSON.stringify([...dismissed].slice(-50)));
      void send("popups", { dismiss: m.id });
      draw();
    });
    return { node, time, message: m };
  };

  /** Fades a note out, then takes it out of the stack and lets the rest slide down. */
  const remove = (node: HTMLElement) => {
    leaving.add(node);
    const done = () => {
      if (!node.parentNode) return;
      const before = tops();
      node.remove();
      leaving.delete(node);
      slide(before);
    };
    if (reduced()) return done();
    node.classList.add("leaving");
    window.setTimeout(done, LEAVE_MS);
  };

  const draw = () => {
    if (since === null) return;
    const due = popupsDue(latest, since, dismissed);
    const up = due.slice(-MAX_SHOWN);
    const ids = new Set(up.map((m) => m.id));
    const before = tops();
    for (const [id, s] of shown) {
      if (ids.has(id)) continue;
      shown.delete(id);
      remove(s.node);
    }
    let fresh = false;
    for (const m of up) {
      if (shown.has(m.id)) continue;
      const s = build(m);
      shown.set(m.id, s);
      // Oldest at the top, newest by the corner: a note newer than every one up goes last, an older one (room was
      // made for it) goes above the first.
      const after = [...shown.values()].find((o) => o !== s && o.message.createdAt > m.createdAt);
      if (after) el.insertBefore(s.node, after.node);
      else el.append(s.node);
      if (!reduced()) s.node.classList.add("entering");
      fresh = true;
    }
    const waiting = due.length - up.length;
    more.textContent = waiting > 0 ? `+${waiting} More` : "";
    more.classList.toggle("show", waiting > 0);
    slide(before);
    if (fresh) onNew?.();
  };

  const stopFeed = subscribe<{ messages: BoardMessage[] }>("messages", 30_000, (data) => {
    latest = data.messages;
    fed = true;
    load();
    // Until the server answers, the first read only learns what's already on the board, so turning the mode on (or a
    // new screen) pops nothing; the server's own starting point replaces it once it arrives.
    if (since === null && !loading) {
      since = newestOf(latest);
      write(SINCE_KEY, String(since));
    }
    // Dismissals of notes that are gone from the board are forgotten, so the list never grows.
    const onBoard = new Set(latest.map((m) => m.id));
    const kept = new Set([...dismissed].filter((id) => onBoard.has(id)));
    if (kept.size !== dismissed.size) {
      dismissed = kept;
      write(DISMISSED_KEY, JSON.stringify([...kept]));
    }
    draw();
  });
  const stopTick = everyMinute((now) => {
    for (const s of shown.values()) s.time.textContent = ago(now.getTime() - s.message.createdAt);
  });
  el.addEventListener("animationend", (ev) => (ev.target as HTMLElement).classList.remove("entering"));

  return {
    el,
    stop: () => {
      stopFeed();
      stopTick();
      // Switched off: start fresh next time, rather than popping everything posted in between.
      write(SINCE_KEY, null);
      write(DISMISSED_KEY, null);
    },
  };
}
