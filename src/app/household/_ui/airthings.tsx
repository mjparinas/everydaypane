"use client";

import { useEffect, useState } from "react";

// Whether an Airthings API client is saved, and its devices (Settings › Indoor air and the widget's device picker).

export interface AirthingsStatus {
  configured: boolean;
  devices: { serial: string; name: string; type: string }[];
  error: string;
}

let pending: Promise<AirthingsStatus> | null = null;
const listeners = new Set<(s: AirthingsStatus) => void>();

export function setAirthingsStatus(s: AirthingsStatus): void {
  pending = Promise.resolve(s);
  listeners.forEach((l) => l(s));
}

export function loadAirthings(fresh = false): Promise<AirthingsStatus> {
  if (!pending || fresh) {
    pending = fetch("/api/household/airthings/")
      .then((r) => (r.ok ? (r.json() as Promise<AirthingsStatus>) : Promise.reject(new Error(String(r.status)))))
      .catch(() => ({ configured: false, devices: [], error: "Couldn't ask the server" }));
    void pending.then((s) => listeners.forEach((l) => l(s)));
  }
  return pending;
}

export function useAirthings(): AirthingsStatus | null {
  const [status, setStatus] = useState<AirthingsStatus | null>(null);
  useEffect(() => {
    let live = true;
    const on = (s: AirthingsStatus) => {
      if (live) setStatus(s);
    };
    listeners.add(on);
    void loadAirthings().then(on);
    return () => {
      live = false;
      listeners.delete(on);
    };
  }, []);
  return status;
}
