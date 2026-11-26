"use client";

import { useEffect, useState } from "react";

import { formatDeviceCode, normalizeDeviceCode } from "@/lib/deviceSignIn";

import { SignInForm } from "../SignInForm";

type DeviceRow = { id: string; name: string };

export function PhoneApprove({ initialCode, signedInAs }: { initialCode: string | null; signedInAs: string | null }) {
  const [code, setCode] = useState(initialCode ?? "");
  const [deviceId, setDeviceId] = useState("");
  const [devices, setDevices] = useState<DeviceRow[] | null>(null);
  const [state, setState] = useState<{ kind: "idle" | "sending" | "done" | "error"; message?: string }>({ kind: "idle" });

  const normalized = normalizeDeviceCode(code);
  const display = normalized ? formatDeviceCode(normalized) : code;

  useEffect(() => {
    if (!signedInAs) return;
    let live = true;
    void fetch("/api/auth/device/displays/")
      .then(async (r) => {
        const body = (await r.json().catch(() => ({}))) as { devices?: DeviceRow[]; error?: string };
        if (!live) return;
        if (!r.ok) {
          setState({ kind: "error", message: body.error ?? "Couldn't load displays." });
          setDevices([]);
          return;
        }
        const list = body.devices ?? [];
        setDevices(list);
        if (list.length === 1 && list[0]) setDeviceId(list[0].id);
      })
      .catch(() => {
        if (live) {
          setDevices([]);
          setState({ kind: "error", message: "Couldn't load displays." });
        }
      });
    return () => {
      live = false;
    };
  }, [signedInAs]);

  async function approve() {
    if (!normalized) {
      setState({ kind: "error", message: "That code isn't valid. Check the display and try again." });
      return;
    }
    if (!deviceId) {
      setState({ kind: "error", message: "Pick which display this is." });
      return;
    }
    setState({ kind: "sending" });
    const r = await fetch("/api/auth/device/approve/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: normalized, deviceId }),
    });
    const body = (await r.json().catch(() => ({}))) as { message?: string; error?: string };
    if (!r.ok) {
      setState({ kind: "error", message: body.error ?? "Couldn't approve that display." });
      return;
    }
    setState({ kind: "done", message: body.message ?? "Approved. The display is unlocking now." });
  }

  if (!signedInAs) {
    const next = normalized ? `/signin/phone/?code=${encodeURIComponent(formatDeviceCode(normalized))}` : "/signin/phone/";
    return (
      <div className="mt-4">
        <p className="text-sm text-soft">Sign in on this phone first, then pick which wall display to unlock.</p>
        {!normalized && (
          <label className="mt-4 grid gap-1 text-sm font-medium">
            Code on the Display
            <input
              className="field font-mono tracking-widest"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="K7QF-29MD"
              autoComplete="one-time-code"
              inputMode="text"
            />
          </label>
        )}
        {normalized && (
          <p className="mt-3 text-center font-mono text-xl font-bold tracking-widest" aria-live="polite">
            {display}
          </p>
        )}
        <SignInForm next={next} />
      </div>
    );
  }

  if (state.kind === "done") {
    return (
      <p className="mt-6 rounded-xl bg-bg p-4 text-sm" role="status">
        {state.message}
      </p>
    );
  }

  return (
    <div className="mt-4 grid gap-3">
      <p className="text-sm text-soft">
        Signed in as <span className="font-medium text-ink">{signedInAs}</span>. Pick which display the wall should show, then Approve.
      </p>
      <label className="grid gap-1 text-sm font-medium">
        Code on the Display
        <input
          className="field font-mono tracking-widest"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="K7QF-29MD"
          autoComplete="one-time-code"
          inputMode="text"
        />
      </label>
      <label className="grid gap-1 text-sm font-medium">
        Display
        {devices === null ? (
          <p className="text-sm text-soft">Loading…</p>
        ) : devices.length === 0 ? (
          <p className="text-sm text-soft">No displays yet. Add one in the Household panel under Displays.</p>
        ) : (
          <select className="field" value={deviceId} onChange={(e) => setDeviceId(e.target.value)} required>
            <option value="">Choose…</option>
            {devices.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        )}
      </label>
      <button
        type="button"
        className="btn-primary"
        disabled={state.kind === "sending" || !deviceId || devices === null || devices.length === 0}
        onClick={() => void approve()}
      >
        {state.kind === "sending" ? "Approving…" : "Approve This Display"}
      </button>
      {state.kind === "error" && (
        <p className="text-sm text-bad" role="alert">
          {state.message}
        </p>
      )}
    </div>
  );
}
