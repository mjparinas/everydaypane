"use client";

import { useEffect, useState } from "react";

import type { NativeSmartProvider } from "@/lib/smartHome";

export interface SmartServiceStatus {
  configured: boolean;
  connected: boolean;
  expired?: boolean;
  error?: string;
}

export type SmartHomeStatus = Record<NativeSmartProvider, SmartServiceStatus>;

export interface SmartProviderDetail extends SmartServiceStatus {
  devices: { id: string; name: string }[];
}

let pending: Promise<SmartHomeStatus> | null = null;
const listeners = new Set<(s: SmartHomeStatus) => void>();

const failed: SmartHomeStatus = {
  nest: { configured: false, connected: false, error: "Couldn't ask the server" },
  ecobee: { configured: false, connected: false, error: "Couldn't ask the server" },
  smartthings: { configured: false, connected: false, error: "Couldn't ask the server" },
};

export function loadSmartHome(fresh = false): Promise<SmartHomeStatus> {
  if (!pending || fresh) {
    pending = fetch("/api/household/smart-home/")
      .then((r) => (r.ok ? (r.json() as Promise<SmartHomeStatus>) : Promise.reject(new Error(String(r.status)))))
      .catch(() => failed);
    void pending.then((s) => listeners.forEach((l) => l(s)));
  }
  return pending;
}

export function useSmartHome(): SmartHomeStatus | null {
  const [status, setStatus] = useState<SmartHomeStatus | null>(null);
  useEffect(() => {
    let live = true;
    const on = (s: SmartHomeStatus) => {
      if (live) setStatus(s);
    };
    listeners.add(on);
    void loadSmartHome().then(on);
    return () => {
      live = false;
      listeners.delete(on);
    };
  }, []);
  return status;
}

export async function loadSmartProvider(provider: NativeSmartProvider): Promise<SmartProviderDetail> {
  const r = await fetch(`/api/household/smart-home/?provider=${provider}`);
  if (!r.ok) return { configured: false, connected: false, devices: [], error: "Couldn't load devices" };
  return r.json() as Promise<SmartProviderDetail>;
}
