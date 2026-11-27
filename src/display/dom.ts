// A tiny element builder: the display's only "framework". Text is always set as text, never parsed as HTML, so
// nothing from a calendar or a message can inject markup. SVG icons are our own constants (icons.ts).

type Attrs = Record<string, string | number | boolean | null | undefined> & { class?: string; style?: string };
type Child = Node | string | number | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    el.setAttribute(k, v === true ? "" : String(v));
  }
  append(el, children);
  return el;
}

export function append(el: Element, children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(typeof c === "string" || typeof c === "number" ? document.createTextNode(String(c)) : c);
  }
}

/** Replaces an element's children. */
export function fill(el: Element, ...children: Child[]): void {
  el.replaceChildren();
  append(el, children);
}

/** An SVG icon from our own constant markup (never from data). */
export function svg(markup: string, cls = "icon"): HTMLSpanElement {
  const span = document.createElement("span");
  span.className = cls;
  span.setAttribute("aria-hidden", "true");
  span.innerHTML = markup;
  return span;
}

/** Sets text only when it changed, so an unchanged second doesn't touch the DOM. */
export function setText(node: { textContent: string | null }, text: string): void {
  if (node.textContent !== text) node.textContent = text;
}

/**
 * Whether the screen saver is covering this element. The dashboard under the saver is hidden, so heavy widgets there
 * pause; a widget on the idle view (drawn inside the saver, Melvin 2026-11-26) is what's on screen and keeps going.
 */
export function underSaver(el: Element): boolean {
  return document.documentElement.classList.contains("saving") && !el.closest(".idle-stage");
}

/**
 * Steps `target`'s font size down until `box` no longer overflows (or `over` says it fits), never below `floorPx`. Text a widget sizes from its
 * cell (a note, a chore title) can otherwise spill past the tile's edges (design review, 2026-11-26). A binary search,
 * so about eight layouts however far it shrinks.
 */
export function shrinkToFit(
  box: HTMLElement,
  target: HTMLElement = box,
  floorPx = 14,
  over = () => box.scrollHeight > box.clientHeight + 1 || box.scrollWidth > box.clientWidth + 1,
): void {
  target.style.fontSize = "";
  if (!box.isConnected || !over()) return;
  let hi = parseFloat(getComputedStyle(target).fontSize);
  if (!Number.isFinite(hi) || hi <= floorPx) return;
  let lo = floorPx;
  while (hi - lo > 0.5) {
    const mid = (lo + hi) / 2;
    target.style.fontSize = `${mid}px`;
    if (over()) hi = mid;
    else lo = mid;
  }
  target.style.fontSize = `${lo}px`;
}

/** Runs `fit` now, when web fonts finish loading and whenever `el` changes size. Returns a stop function. */
export function keepFitted(el: HTMLElement, fit: () => void): () => void {
  let frame = 0;
  const later = () => {
    window.cancelAnimationFrame(frame);
    frame = window.requestAnimationFrame(fit);
  };
  later();
  void document.fonts?.ready.then(later);
  const ro = typeof ResizeObserver === "function" ? new ResizeObserver(later) : null;
  ro?.observe(el);
  return () => {
    window.cancelAnimationFrame(frame);
    ro?.disconnect();
  };
}

/**
 * Lets a list or a short text fill its tile (design review, 2026-11-26: four events used a fifth of a tall schedule
 * tile). The stylesheet sizes `root` for the whole tile; this steps it down while it overflows, never below `floorPx`,
 * on resize and whenever the widget calls `fit` after drawing new content.
 */
export function fillTile(
  el: HTMLElement,
  root: HTMLElement,
  floorPx: number,
  box: HTMLElement = root,
): { fit: () => void; stop: () => void } {
  const fit = () => {
    shrinkToFit(box, root, floorPx);
    // Still too long at the floor: the stylesheet may fade the bottom edge to say there's more.
    root.toggleAttribute("data-over", box.scrollHeight > box.clientHeight + 1);
  };
  return { fit, stop: keepFitted(el, fit) };
}

/**
 * Hides a list's last items, one at a time, while the list overflows its box, keeping at least one, so the wall
 * never shows half a row (design review, 2026-11-26: hide what doesn't fit rather than shrink it below the floor).
 */
export function dropOverflow(box: HTMLElement, items: string, keep?: HTMLElement | null): void {
  const rows = [...box.querySelectorAll<HTMLElement>(items)];
  // An inline style, because a row's own `display` rule would beat the `hidden` attribute.
  for (const r of rows) r.style.display = "";
  const first = keep ? 0 : 1;
  for (let i = rows.length - 1; i >= first && box.scrollHeight > box.clientHeight + 1; i--) {
    const row = rows[i]!;
    if (row !== keep) row.style.display = "none";
  }
}
