"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

// Shared right slide-out chrome for the Views editor (Melvin, 2026-11-22): keeps the live layout visible.
// Focus the close control only when `openKey` changes, so typing in fields does not steal focus.

export function SlideDrawer({
  title,
  openKey,
  onClose,
  children,
  testId,
  closeLabel = "Close",
}: {
  title: string;
  /** Identity of what is open (widget id / view id); changing it re-focuses the close button. */
  openKey: string;
  onClose: () => void;
  children: ReactNode;
  testId?: string;
  closeLabel?: string;
}) {
  const titleId = useId();
  const closeBtn = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const prev = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      prev?.focus();
    };
  }, [openKey]);

  return (
    <div className="fixed inset-0 z-40 flex justify-end" id={testId} data-testid={testId}>
      <button type="button" className="absolute inset-0 bg-black/25" aria-label={closeLabel} onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex h-full w-[min(100%,24rem)] max-w-[calc(100%-2.5rem)] flex-col border-l border-line bg-panel shadow-xl [animation:slide-in-right_180ms_ease-out]"
      >
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <h2 id={titleId} className="min-w-0 flex-1 truncate text-base font-semibold">
            {title}
          </h2>
          <button ref={closeBtn} type="button" className="btn-ghost min-h-9 px-3" onClick={onClose} aria-label={closeLabel}>
            ✕
          </button>
        </div>
        <div className="grid flex-1 content-start gap-4 overflow-y-auto p-4 pb-[calc(5rem+env(safe-area-inset-bottom))]">{children}</div>
      </div>
    </div>
  );
}
