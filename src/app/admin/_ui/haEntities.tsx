"use client";

import { createElement, useEffect, useState } from "react";

// Home Assistant's status and entity list, loaded once per page and shared by the Settings panel and the widget
// pickers (listing every entity can take a few seconds through the tunnel).

export interface HaStatus {
  tokenSet: boolean;
  accessSet: boolean;
  connected: boolean;
  message?: string;
  error?: string;
  entities: { id: string; name: string }[];
}

let pending: Promise<HaStatus> | null = null;
const listeners = new Set<(s: HaStatus) => void>();

export function loadHa(fresh = false): Promise<HaStatus> {
  if (!pending || fresh) {
    pending = fetch("/api/admin/ha/")
      .then((r) => (r.ok ? (r.json() as Promise<HaStatus>) : Promise.reject(new Error(String(r.status)))))
      .catch((): HaStatus => ({ tokenSet: false, accessSet: false, connected: false, error: "Couldn't ask the server", entities: [] }));
    void pending.then((s) => listeners.forEach((l) => l(s)));
  }
  return pending;
}

export function useHa(): HaStatus | null {
  const [status, setStatus] = useState<HaStatus | null>(null);
  useEffect(() => {
    let live = true;
    const l = (s: HaStatus) => live && setStatus(s);
    listeners.add(l);
    void loadHa().then(l);
    return () => {
      live = false;
      listeners.delete(l);
    };
  }, []);
  return status;
}

/** Suggestions for an entity field: every entity, or those starting with `only` (such as "camera."). */
export function HaEntityList({ id, only }: { id: string; only?: string }) {
  const status = useHa();
  const entities = (status?.entities ?? []).filter((e) => !only || e.id.startsWith(only));
  return createElement(
    "datalist",
    { id },
    entities.map((e) => createElement("option", { key: e.id, value: e.id }, e.name === e.id ? undefined : e.name)),
  );
}
