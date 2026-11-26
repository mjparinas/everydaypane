"use client";

import { useEffect, useState } from "react";

// Which laundry sources are connected and the machines they list (Settings › Laundry and the widget's machine picker).

export interface LaundryStatus {
  lg: boolean;
  smartthings: boolean;
  machines: { id: string; name: string; kind: "washer" | "dryer" | "combo" }[];
  error: string;
}

let pending: Promise<LaundryStatus> | null = null;
const listeners = new Set<(s: LaundryStatus) => void>();

export function setLaundryStatus(s: LaundryStatus): void {
  pending = Promise.resolve(s);
  listeners.forEach((l) => l(s));
}

export function loadLaundry(fresh = false): Promise<LaundryStatus> {
  if (!pending || fresh) {
    pending = fetch("/api/household/laundry/")
      .then((r) => (r.ok ? (r.json() as Promise<LaundryStatus>) : Promise.reject(new Error(String(r.status)))))
      .catch(() => ({ lg: false, smartthings: false, machines: [], error: "Couldn't ask the server" }));
    void pending.then((s) => listeners.forEach((l) => l(s)));
  }
  return pending;
}

export function useLaundry(): LaundryStatus | null {
  const [status, setStatus] = useState<LaundryStatus | null>(null);
  useEffect(() => {
    let live = true;
    const on = (s: LaundryStatus) => {
      if (live) setStatus(s);
    };
    listeners.add(on);
    void loadLaundry().then(on);
    return () => {
      live = false;
      listeners.delete(on);
    };
  }, []);
  return status;
}
