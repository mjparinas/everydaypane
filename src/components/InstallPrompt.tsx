"use client";

import { useEffect, useState } from "react";

import { inNativeApp } from "@/lib/nativeApp";

// "Add to Home Screen" for the household and family pages in a phone's browser (Melvin, 2026-11-27). Android's
// Chrome offers its own install prompt, which this button opens; iPhone and iPad Safari have no prompt to open, so
// the card says where the button is. Hidden in the Everydaypane app, once installed, and after "Not Now" (per phone).

interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "everydaypane.install.dismissed";

function dismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

/** iPhone or iPad Safari, not yet on the home screen (iPadOS reports a Mac, so touch tells them apart). */
export function iosSafari(ua: string, touchPoints: number): boolean {
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && touchPoints > 1);
  return ios && /Safari\//.test(ua) && !/CriOS|FxiOS|EdgiOS|EverydaypaneApp/.test(ua);
}

export function InstallPrompt() {
  const [mode, setMode] = useState<"android" | "ios" | null>(null);
  const [event, setEvent] = useState<InstallEvent | null>(null);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone || inNativeApp() || dismissed()) return;
    if (iosSafari(navigator.userAgent, navigator.maxTouchPoints)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- the browser is only known on the client
      setMode("ios");
      return;
    }
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvent(e as InstallEvent);
      setMode("android");
    };
    const onInstalled = () => setMode(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!mode) return null;
  const notNow = () => {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Private browsing: it just comes back next time.
    }
    setMode(null);
  };

  return (
    <section
      className="mx-auto grid w-full max-w-xl gap-2 rounded-2xl border border-line bg-panel p-4"
      aria-labelledby="install-heading"
      data-testid="install-prompt"
    >
      <h2 id="install-heading" className="text-base font-bold">
        Add Everydaypane to Your Home Screen
      </h2>
      {mode === "ios" ? (
        <p className="text-sm text-soft">
          Tap the Share button <span aria-hidden="true">(□↑)</span> in Safari, then <strong className="text-ink">Add to Home Screen</strong>
          . It opens full screen, like an app.
        </p>
      ) : (
        <p className="text-sm text-soft">Open the family board, meals and shopping list in one tap, full screen.</p>
      )}
      <div className="flex flex-wrap gap-2">
        {mode === "android" && event && (
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              void event.prompt();
              void event.userChoice.then(() => setMode(null));
            }}
          >
            Add to Home Screen
          </button>
        )}
        <button type="button" className="btn-ghost" onClick={notNow}>
          Not Now
        </button>
      </div>
    </section>
  );
}
