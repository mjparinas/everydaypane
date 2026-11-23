// Full-screen overlays on the wall (doorbell, timer alarm). Kitchen use is mostly touch, but Escape and a moved
// focus still matter for a keyboard plugged into the wall panel or for assistive tech (a11y audit, 2026-11-22).

/** Focuses `el`, closes on Escape, restores the previous focus when the returned function runs. */
export function attachModal(el: HTMLElement, onDismiss: () => void): () => void {
  el.setAttribute("aria-modal", "true");
  if (!el.hasAttribute("tabindex")) el.tabIndex = -1;
  const prev = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "Escape") return;
    e.preventDefault();
    e.stopPropagation();
    onDismiss();
  };
  document.addEventListener("keydown", onKey, true);
  // After append, so the dialog is in the tree when focus moves.
  queueMicrotask(() => {
    try {
      el.focus({ preventScroll: true });
    } catch {
      // jsdom and some embedded browsers refuse focus; the Escape listener still works.
    }
  });
  let closed = false;
  return () => {
    if (closed) return;
    closed = true;
    document.removeEventListener("keydown", onKey, true);
    if (prev?.isConnected) {
      try {
        prev.focus({ preventScroll: true });
      } catch {
        // Same as above.
      }
    }
  };
}
