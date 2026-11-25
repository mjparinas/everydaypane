"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { DISPLAY_PATH } from "@/lib/site";

type StartBody = {
  ok?: boolean;
  code?: string;
  pollSecret?: string;
  expiresAt?: number;
  phoneUrl?: string;
  qrSvg?: string;
  error?: string;
};

type PollBody = {
  status?: "pending" | "ready" | "expired" | "claimed";
  handoff?: string;
  error?: string;
};

type DeviceRow = { id: string; name: string };

/**
 * Lock screen for `/display/`: auto QR for non-touch panels; signed-in members can pick a display on this screen.
 */
export function DisplayUnlock({ signedInAs }: { signedInAs: string | null }) {
  const [devices, setDevices] = useState<DeviceRow[] | null>(signedInAs ? null : []);
  const [deviceError, setDeviceError] = useState("");
  const [selecting, setSelecting] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [qrSvg, setQrSvg] = useState("");
  const [qrError, setQrError] = useState("");
  const [status, setStatus] = useState<"waiting" | "unlocking" | "done">("waiting");
  const pollSecret = useRef("");
  const expiresAt = useRef(0);
  const [qrNonce, setQrNonce] = useState(0);

  const finish = useCallback(async (handoff: string) => {
    setStatus("unlocking");
    const r = await fetch("/api/auth/device/claim/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ handoff }),
    });
    const body = (await r.json().catch(() => ({}))) as { error?: string };
    if (!r.ok) {
      setStatus("waiting");
      setQrError(body.error ?? "Couldn't finish unlocking. Try a new code.");
      setQrNonce((n) => n + 1);
      return;
    }
    setStatus("done");
    window.location.replace(DISPLAY_PATH);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const r = await fetch("/api/auth/device/start/", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const body = (await r.json().catch(() => ({}))) as StartBody;
      if (cancelled) return;
      if (!r.ok || !body.code || !body.pollSecret || !body.qrSvg) {
        setQrError(body.error ?? "Couldn't start phone unlock.");
        return;
      }
      setCode(body.code);
      setQrSvg(body.qrSvg);
      setQrError("");
      pollSecret.current = body.pollSecret;
      expiresAt.current = body.expiresAt ?? Date.now() + 600_000;
      setStatus("waiting");
    })();
    return () => {
      cancelled = true;
    };
  }, [qrNonce]);

  useEffect(() => {
    if (!signedInAs) return;
    let live = true;
    void fetch("/api/auth/device/displays/")
      .then(async (r) => {
        const body = (await r.json().catch(() => ({}))) as { devices?: DeviceRow[]; error?: string };
        if (!live) return;
        if (!r.ok) {
          setDeviceError(body.error ?? "Couldn't load displays.");
          setDevices([]);
          return;
        }
        setDevices(body.devices ?? []);
      })
      .catch(() => {
        if (live) {
          setDeviceError("Couldn't load displays.");
          setDevices([]);
        }
      });
    return () => {
      live = false;
    };
  }, [signedInAs]);

  useEffect(() => {
    if (status !== "waiting" || !code || !pollSecret.current) return;
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      if (Date.now() > expiresAt.current) {
        setQrError("That code expired.");
        setQrNonce((n) => n + 1);
        return;
      }
      const r = await fetch("/api/auth/device/poll/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, pollSecret: pollSecret.current }),
      });
      const body = (await r.json().catch(() => ({}))) as PollBody & { error?: string };
      if (cancelled) return;
      if (r.status === 429) {
        setQrError(body.error ?? "Waiting slowed down. Keep this screen open.");
        return;
      }
      if (body.status === "ready" && body.handoff) {
        await finish(body.handoff);
        return;
      }
      if (body.status === "expired" || body.status === "claimed") {
        setQrError(body.status === "claimed" ? "Already unlocked." : "That code expired.");
        setQrNonce((n) => n + 1);
      }
    };
    const id = window.setInterval(() => void tick(), 2000);
    void tick();
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [status, code, finish]);

  async function selectDevice(id: string) {
    setDeviceError("");
    setSelecting(id);
    const r = await fetch("/api/auth/device/select/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId: id }),
    });
    const body = (await r.json().catch(() => ({}))) as { error?: string };
    if (!r.ok) {
      setSelecting(null);
      setDeviceError(body.error ?? "Couldn't unlock that display.");
      return;
    }
    window.location.replace(DISPLAY_PATH);
  }

  return (
    <div className="mt-6 grid gap-8">
      {signedInAs ? (
        <section className="grid gap-3">
          <h2 className="text-sm font-semibold">Choose a display</h2>
          <p className="text-sm text-soft">
            Signed in as <span className="font-medium text-ink">{signedInAs}</span>. Pick which wall this screen is.
          </p>
          {devices === null ? (
            <p className="text-sm text-soft">Loading…</p>
          ) : devices.length === 0 ? (
            <p className="text-sm text-soft">No displays yet. Add one in the Household panel under Displays.</p>
          ) : (
            <ul className="grid gap-2">
              {devices.map((d) => (
                <li key={d.id}>
                  <button
                    type="button"
                    className="btn-primary w-full"
                    disabled={selecting !== null}
                    onClick={() => void selectDevice(d.id)}
                  >
                    {selecting === d.id ? "Unlocking…" : d.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {deviceError && (
            <p className="text-sm text-bad" role="alert">
              {deviceError}
            </p>
          )}
        </section>
      ) : null}

      <section className="grid gap-3">
        <h2 className="text-sm font-semibold">{signedInAs ? "Or unlock with your phone" : "Scan with your phone"}</h2>
        <p className="text-sm text-soft">
          {signedInAs
            ? "For TVs and panels without touch: scan the code, sign in on your phone, pick this display, then Approve."
            : "Scan the code, sign in on your phone, pick which display this is, then Approve. This screen finishes by itself."}
        </p>
        {qrSvg ? (
          // eslint-disable-next-line @next/next/no-img-element -- inline SVG data URL from our own start route
          <img
            className="mx-auto h-48 w-48 rounded-lg bg-white p-2"
            src={`data:image/svg+xml;utf8,${encodeURIComponent(qrSvg)}`}
            alt="QR code to unlock this display on your phone"
          />
        ) : (
          <div className="mx-auto grid h-48 w-48 place-items-center rounded-lg bg-bg text-sm text-soft">Loading…</div>
        )}
        <p className="text-center font-mono text-2xl font-bold tracking-widest" aria-live="polite">
          {code || "————"}
        </p>
        <p className="text-center text-xs text-soft">
          {status === "unlocking" ? "Unlocking…" : status === "done" ? "Unlocked." : "Waiting for your phone…"}
        </p>
        {qrError && (
          <p className="text-center text-sm text-bad" role="alert">
            {qrError}
          </p>
        )}
        <button type="button" className="btn-ghost" onClick={() => setQrNonce((n) => n + 1)} disabled={status === "unlocking"}>
          New code
        </button>
      </section>
    </div>
  );
}
