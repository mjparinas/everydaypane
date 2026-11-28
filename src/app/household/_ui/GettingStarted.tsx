"use client";

import { useEffect, useState } from "react";

import { isFreeSafeConfig } from "@/lib/config/defaults";
import { fitFree } from "@/lib/config/freeWall";
import { TRIAL_DAYS } from "@/lib/plans";

import { usePlan } from "./plan";
import { useAdmin } from "./store";

// Conversion work (Melvin, 2026-11-28: "can do you all 5"): the trial's banner, and a short Get Started list that gets
// a new household's own calendar, photos and a screen going in the first few minutes, because that first look at the
// wall is when families decide whether it's for them.

const go = (hash: string) => {
  history.replaceState(null, "", hash);
  window.dispatchEvent(new HashChangeEvent("hashchange"));
};

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeFlag(key: string): void {
  try {
    localStorage.setItem(key, "1");
  } catch {
    // A private window can't remember; the note just comes back next visit.
  }
}

/**
 * One line under the header about the Household trial: an offer for a Free household that never had one, a countdown
 * in the trial's last four days (earlier the Plan chip carries the days, so it isn't a nag), and what changed once
 * it's over, with a way to tidy the settings so Publish works on Free again.
 */
export function TrialBanner() {
  const { loading, trialing, trialDaysLeft, trialAvailable, trialEnded, subscribed, openUpgrade } = usePlan();
  const config = useAdmin((s) => s.config);
  const edit = useAdmin((s) => s.edit);
  const [offerHidden, setOfferHidden] = useState(() => typeof window === "undefined" || readFlag("everydaypane.trialOffer.dismissed"));
  if (loading || subscribed) return null;

  let body: React.ReactNode = null;
  if (trialing && trialDaysLeft <= 4) {
    body = (
      <>
        <p className="min-w-0 flex-1 text-sm">
          <strong>
            {trialDaysLeft} {trialDaysLeft === 1 ? "day" : "days"} left in your Household trial.
          </strong>{" "}
          <span className="text-soft">After that the wall goes back to Free widgets unless you subscribe.</span>
        </p>
        <button type="button" className="btn-primary shrink-0" onClick={() => openUpgrade("default")}>
          Keep Household
        </button>
      </>
    );
  } else if (trialEnded && !isFreeSafeConfig(config)) {
    body = (
      <>
        <p className="min-w-0 flex-1 text-sm">
          <strong>Your Household trial has ended.</strong>{" "}
          <span className="text-soft">The wall shows your Free widgets now, and Household ones are paused until you subscribe.</span>
        </p>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button type="button" className="btn-primary" onClick={() => openUpgrade("default")}>
            Keep Household
          </button>
          <button
            type="button"
            className="btn-ghost"
            // Takes the Household parts out of the working copy; nothing changes on the wall until Publish.
            onClick={() => edit((c) => Object.assign(c, fitFree(c)))}
          >
            Switch to the Free Layout
          </button>
        </div>
      </>
    );
  } else if (trialAvailable && !offerHidden) {
    body = (
      <>
        <p className="min-w-0 flex-1 text-sm">
          <strong>Try every Household feature free for {TRIAL_DAYS} days.</strong>{" "}
          <span className="text-soft">No card needed, and you’re back on Free afterwards unless you subscribe.</span>
        </p>
        <div className="flex shrink-0 gap-2">
          <button type="button" className="btn-primary" onClick={() => openUpgrade("default")}>
            Try Household Free
          </button>
          <button
            type="button"
            className="btn-ghost text-soft"
            onClick={() => {
              writeFlag("everydaypane.trialOffer.dismissed");
              setOfferHidden(true);
            }}
          >
            Not Now
          </button>
        </div>
      </>
    );
  }
  if (!body) return null;
  return (
    <div className="border-b border-line bg-brand/5" role="region" aria-label="Household trial">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-2.5">{body}</div>
    </div>
  );
}

type Step = { id: string; label: string; hint: string; done: boolean; action: string; hash: string };

/**
 * Get Started on the Views tab until the wall shows the family's own week: their calendar, their photos and a real
 * screen. Each step is read from what's already set up, so it ticks itself; it goes away when all three are done or
 * someone taps Hide.
 */
export function SetupChecklist() {
  const config = useAdmin((s) => s.config);
  const [devices, setDevices] = useState<number | null>(null);
  const [hidden, setHidden] = useState(() => typeof window === "undefined" || readFlag("everydaypane.setup.hidden"));

  useEffect(() => {
    let live = true;
    fetch("/api/household/devices/")
      .then((r) => (r.ok ? (r.json() as Promise<{ devices: unknown[] }>) : null))
      .then((b) => {
        if (live) setDevices(b ? b.devices.length : null);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  const i = config.integrations;
  const calendars =
    i.google.calendars.some((c) => c.enabled) || i.microsoft.calendars.some((c) => c.enabled) || i.icals.some((c) => c.enabled);
  const steps: Step[] = [
    {
      id: "calendar",
      label: "Connect Your Calendar",
      hint: "Google or Microsoft 365. Your family's events show on the wall in a few minutes.",
      done: calendars,
      action: "Connect",
      hash: "#settings/google",
    },
    {
      id: "photos",
      label: "Add Your Photos",
      hint: "Upload a few from your phone, or pick an album from Google Photos or Amazon.",
      done: i.photos.sources.length > 0,
      action: "Add Photos",
      hash: "#settings/photos",
    },
    {
      id: "screen",
      label: "Put It on a Screen",
      hint: "Open everydaypane.com/display on any tablet, TV or old laptop and scan the code with your phone.",
      done: (devices ?? 0) > 0,
      action: "Set Up a Display",
      hash: "#displays",
    },
  ];
  const left = steps.filter((s) => !s.done).length;
  if (hidden || devices === null || left === 0) return null;

  return (
    <section className="card mb-4 grid gap-3" aria-labelledby="setup-title" data-testid="setup-checklist">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 id="setup-title" className="text-lg font-bold">
            Get Started
          </h2>
          <p className="text-sm text-soft">
            {left === 1 ? "One step" : `${left} steps`} to your own wall. Weather is set for{" "}
            <button
              type="button"
              className="font-semibold text-brand underline-offset-2 hover:underline"
              onClick={() => go("#settings/location")}
            >
              {config.location.name}
            </button>
            .
          </p>
        </div>
        <button
          type="button"
          className="btn-ghost min-h-9 shrink-0 px-3 text-soft"
          onClick={() => {
            writeFlag("everydaypane.setup.hidden");
            setHidden(true);
          }}
        >
          Hide
        </button>
      </div>
      <ol className="grid gap-2 sm:grid-cols-3">
        {steps.map((s, n) => (
          <li
            key={s.id}
            className={`flex flex-col gap-2 rounded-2xl border p-3 ${s.done ? "border-good/40 bg-good/5" : "border-line bg-bg"}`}
          >
            <p className="flex items-center gap-2 font-semibold">
              <span
                aria-hidden="true"
                className={`inline-flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  s.done ? "bg-good text-white" : "bg-panel text-soft ring-1 ring-line"
                }`}
              >
                {s.done ? "✓" : n + 1}
              </span>
              {s.label}
              {s.done ? <span className="sr-only">(done)</span> : null}
            </p>
            <p className="flex-1 text-sm text-soft">{s.hint}</p>
            {s.done ? null : (
              <button type="button" className="btn-primary justify-self-start" onClick={() => go(s.hash)}>
                {s.action}
              </button>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
