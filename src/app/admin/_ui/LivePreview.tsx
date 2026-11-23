"use client";

import { useEffect, useRef, useState } from "react";

import type { DashboardConfig } from "@/lib/config/schema";
import { clearDraftMessage, draftMessage, parsePreviewReady } from "@/lib/display/draftMessage";
import { displayPayload } from "@/lib/display/payload";

// Embedded admin preview of one view (Melvin, 2026-11-22): the real display shell in an iframe, fed the Zustand
// working copy over postMessage so widget settings update live before Save. Wall displays still only see saved config.
// Remount with key={viewId} from ViewsPanel when the active view changes.

const DESIGN_W = 1920;
const DESIGN_H = 1080;

export function LivePreview({ viewId, config, version }: { viewId: string; config: DashboardConfig; version: number }) {
  const shell = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [scale, setScale] = useState(0.5);
  const [listening, setListening] = useState(false);
  const draftTimer = useRef<number | undefined>(undefined);
  const latest = useRef({ config, version, viewId });

  const src = `/admin/preview/${encodeURIComponent(viewId)}/?mode=day`;

  // Scale the 1920×1080 design into the panel width.
  useEffect(() => {
    const el = shell.current;
    if (!el) return;
    const measure = () => setScale(Math.max(0.1, el.clientWidth / DESIGN_W));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    latest.current = { config, version, viewId };
  }, [config, version, viewId]);

  function sendDraft(win: Window) {
    const { config: c, version: v, viewId: id } = latest.current;
    try {
      win.postMessage(draftMessage(displayPayload(c, v, null, id)), window.location.origin);
    } catch {
      // Frame navigated away mid-send.
    }
  }

  // Push the working copy whenever it changes and the iframe has announced ready.
  useEffect(() => {
    if (!listening) return;
    const win = frame.current?.contentWindow;
    if (!win) return;
    window.clearTimeout(draftTimer.current);
    draftTimer.current = window.setTimeout(() => sendDraft(win), 120);
    return () => window.clearTimeout(draftTimer.current);
  }, [config, version, viewId, listening]);

  // Listen for the preview's "ready" ping (and clear the draft if this panel unmounts).
  useEffect(() => {
    const iframe = frame.current;
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.source !== iframe?.contentWindow) return;
      if (!parsePreviewReady(event.data)) return;
      setListening(true);
      // Push immediately: the ping means the listener is up.
      if (event.source && "postMessage" in event.source) sendDraft(event.source as Window);
    };
    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
      const win = iframe?.contentWindow;
      if (win) {
        try {
          win.postMessage(clearDraftMessage(), window.location.origin);
        } catch {
          // Frame already gone.
        }
      }
    };
  }, [viewId]);

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-soft">Live preview</h2>
        <a className="btn-ghost min-h-9 px-3 text-sm" href={src} target="_blank" rel="noreferrer">
          Open full preview ↗
        </a>
      </div>
      <div
        ref={shell}
        className="relative w-full overflow-hidden rounded-2xl border border-line bg-black"
        style={{ aspectRatio: `${DESIGN_W} / ${DESIGN_H}` }}
        data-testid="live-preview"
      >
        <iframe
          ref={frame}
          title="Preview of this view"
          src={src}
          className="absolute top-0 left-0 border-0"
          style={{
            width: DESIGN_W,
            height: DESIGN_H,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            pointerEvents: "auto",
          }}
          // Sandbox keeps the preview from navigating the admin; same-origin scripts still run for the display.
          sandbox="allow-scripts allow-same-origin allow-forms"
        />
      </div>
      <p className="text-xs text-soft">Updates as you edit. Save still sends the view to the wall screens.</p>
    </div>
  );
}
