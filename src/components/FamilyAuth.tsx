"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

// When a phone opens `/d/<token>/edit/`, fetches to meals / shopping / messages carry the display token so those
// APIs accept them without a magic-link session (Melvin, 2026-11-22). /family/ and the admin tabs leave this empty.

type FamilyAuth = { displayToken: string | null };

const FamilyAuthContext = createContext<FamilyAuth>({ displayToken: null });

export function FamilyAuthProvider({ displayToken, children }: { displayToken?: string; children: ReactNode }) {
  const value = useMemo(() => ({ displayToken: displayToken ?? null }), [displayToken]);
  return <FamilyAuthContext.Provider value={value}>{children}</FamilyAuthContext.Provider>;
}

export function useFamilyAuth(): FamilyAuth {
  return useContext(FamilyAuthContext);
}

/** Same-origin fetch; adds `x-display-token` on the kitchen edit page. */
export function useFamilyFetch(): typeof fetch {
  const { displayToken } = useFamilyAuth();
  return (input: RequestInfo | URL, init?: RequestInit) => {
    if (!displayToken) return fetch(input, init);
    const headers = new Headers(init?.headers);
    headers.set("x-display-token", displayToken);
    return fetch(input, { ...init, headers });
  };
}

export function familyAuthError(status: number, viaDisplay: boolean, fallback: string): string {
  if (status !== 401) return fallback;
  return viaDisplay ? "This link isn't valid anymore. Scan the QR on the display again." : "You've been signed out. Sign in again.";
}
