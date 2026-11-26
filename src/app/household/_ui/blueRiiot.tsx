"use client";

import { useEffect, useState } from "react";

// Whether a Blue Riiot sign-in is saved, and its pools (Settings › Pool and the widget's pool picker).

export interface PoolStatus {
  configured: boolean;
  pools: { id: string; name: string }[];
  error: string;
}

let pending: Promise<PoolStatus> | null = null;
const listeners = new Set<(s: PoolStatus) => void>();

export function setPoolStatus(s: PoolStatus): void {
  pending = Promise.resolve(s);
  listeners.forEach((l) => l(s));
}

export function loadPools(fresh = false): Promise<PoolStatus> {
  if (!pending || fresh) {
    pending = fetch("/api/household/blueriiot/")
      .then((r) => (r.ok ? (r.json() as Promise<PoolStatus>) : Promise.reject(new Error(String(r.status)))))
      .catch(() => ({ configured: false, pools: [], error: "Couldn't ask the server" }));
    void pending.then((s) => listeners.forEach((l) => l(s)));
  }
  return pending;
}

export function usePools(): PoolStatus | null {
  const [status, setStatus] = useState<PoolStatus | null>(null);
  useEffect(() => {
    let live = true;
    const on = (s: PoolStatus) => {
      if (live) setStatus(s);
    };
    listeners.add(on);
    void loadPools().then(on);
    return () => {
      live = false;
      listeners.delete(on);
    };
  }, []);
  return status;
}
