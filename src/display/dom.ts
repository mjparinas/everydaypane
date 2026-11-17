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
