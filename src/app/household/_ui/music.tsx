"use client";

import { useEffect, useState } from "react";

// Spotify and Sonos signed in directly (Melvin, 2026-11-18): their status and the Sonos speakers, loaded once per page
// and shared by Settings › Music and the music widget's speaker picker.

export interface ServiceStatus {
  configured: boolean;
  connected: boolean;
  expired?: boolean;
  error?: string;
}
export interface MusicStatus {
  spotify: ServiceStatus;
  sonos: ServiceStatus & { players: { id: string; name: string }[] };
}

const failed: MusicStatus = {
  spotify: { configured: false, connected: false, error: "Couldn't ask the server" },
  sonos: { configured: false, connected: false, error: "Couldn't ask the server", players: [] },
};

let pending: Promise<MusicStatus> | null = null;
const listeners = new Set<(s: MusicStatus) => void>();

export function loadMusic(fresh = false): Promise<MusicStatus> {
  if (!pending || fresh) {
    pending = fetch("/api/household/music/")
      .then((r) => (r.ok ? (r.json() as Promise<MusicStatus>) : Promise.reject(new Error(String(r.status)))))
      .catch(() => failed);
    void pending.then((s) => listeners.forEach((l) => l(s)));
  }
  return pending;
}

export function useMusic(): MusicStatus | null {
  const [status, setStatus] = useState<MusicStatus | null>(null);
  useEffect(() => {
    let live = true;
    const l = (s: MusicStatus) => live && setStatus(s);
    listeners.add(l);
    void loadMusic().then(l);
    return () => {
      live = false;
      listeners.delete(l);
    };
  }, []);
  return status;
}
