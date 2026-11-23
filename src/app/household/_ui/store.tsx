"use client";

import { createContext, createElement, useContext, useState, type ReactNode } from "react";
import { createStore, useStore, type StoreApi } from "zustand";

import type { DashboardConfig } from "@/lib/config/schema";

// The admin panel's working copy of the settings document. Every edit changes the copy; Save sends the whole document
// with the version it started from, so a save made on a stale copy (another phone saved first) is refused with 409
// instead of silently overwriting (src/server/config.ts).

type Status =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved" }
  | { kind: "conflict"; message: string }
  | { kind: "invalid"; message: string }
  | { kind: "error"; message: string };

interface AdminState {
  config: DashboardConfig;
  version: number;
  /** The document as last saved, to know whether there is anything to save. */
  saved: string;
  status: Status;
  init: (config: DashboardConfig, version: number) => void;
  edit: (change: (draft: DashboardConfig) => void) => void;
  save: () => Promise<void>;
  reload: () => Promise<void>;
  discard: () => void;
  /** Dismisses a conflict so the draft can be edited and saved again. */
  clearConflict: () => void;
}

interface Issue {
  path?: (string | number)[];
  message?: string;
}

/** Turns the first validation issue into words a person can act on ("Views › Kitchen › widget 3: …"). */
export function describeIssue(config: DashboardConfig, issues: unknown): string {
  const first = Array.isArray(issues) ? (issues[0] as Issue | undefined) : undefined;
  if (!first?.message) return "Something in the settings isn't valid.";
  const path = first.path ?? [];
  const where: string[] = [];
  if (path[0] === "views" && typeof path[1] === "number") {
    const view = config.views[path[1]];
    where.push(view ? `View “${view.name}”` : "A view");
    if (path[2] === "widgets" && typeof path[3] === "number") {
      const w = view?.widgets[path[3]];
      where.push(w ? `the ${w.title || w.type} widget` : "a widget");
    }
  } else if (path[0] === "themes" && typeof path[1] === "number") {
    where.push(`Theme “${config.themes[path[1]]?.name ?? ""}”`);
  } else if (path[0] === "schedule" && typeof path[1] === "string") {
    const labels = { morning: "morning", afternoon: "afternoon", evening: "evening", night: "overnight" } as const;
    const period = path[1] in labels ? labels[path[1] as keyof typeof labels] : path[1];
    where.push(`The ${period} schedule`);
  } else if (typeof path[0] === "string") {
    where.push(path[0]);
  }
  return where.length ? `${where.join(", ")}: ${first.message}` : first.message;
}

// One store per admin page, made with the settings the server rendered, so the first render (on the server too) has them.
const createAdminStore = (initial: DashboardConfig, initialVersion: number) => {
  // Bumps on every save so a response from an earlier attempt can't overwrite a newer one.
  let saveGeneration = 0;
  return createStore<AdminState>()((set, get) => ({
    config: initial,
    version: initialVersion,
    saved: JSON.stringify(initial),
    status: { kind: "idle" },
    init: (config, version) => set({ config, version, saved: JSON.stringify(config), status: { kind: "idle" } }),
    edit: (change) => {
      const draft = structuredClone(get().config);
      change(draft);
      const status = get().status;
      // A save in flight stays "saving", so a second Save is ignored until it lands. A conflict stays up until
      // "Keep editing" or "Load their changes".
      const keep = status.kind === "conflict" || status.kind === "saving" ? status : { kind: "idle" as const };
      set({ config: draft, status: keep });
    },
    save: async () => {
      if (get().status.kind === "saving") return;
      const generation = ++saveGeneration;
      const { config, version } = get();
      const snapshot = JSON.stringify(config);
      set({ status: { kind: "saving" } });
      try {
        const r = await fetch("/api/household/config/", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ baseVersion: version, config }),
        });
        const body = (await r.json().catch(() => ({}))) as { version?: number; error?: string; issues?: unknown };
        if (generation !== saveGeneration) return;
        if (r.ok && typeof body.version === "number") {
          // The draft may have moved while this request was in flight: keep it, and only mark the copy we sent as saved.
          const dirty = JSON.stringify(get().config) !== snapshot;
          set({ version: body.version, saved: snapshot, status: dirty ? { kind: "idle" } : { kind: "saved" } });
        } else if (r.status === 409) {
          // A late refusal after our own version already moved (an overlapping save landed) is not a conflict to show.
          if (get().version !== version) return;
          set({ status: { kind: "conflict", message: body.error ?? "Someone else changed the dashboard." } });
        } else if (r.status === 422) {
          set({ status: { kind: "invalid", message: describeIssue(config, body.issues) } });
        } else if (r.status === 401) {
          set({ status: { kind: "error", message: "You've been signed out. Sign in again to save." } });
        } else {
          set({ status: { kind: "error", message: body.error ?? "Couldn't save. Try again." } });
        }
      } catch {
        if (generation !== saveGeneration) return;
        set({ status: { kind: "error", message: "No connection. Your changes are still here; try again." } });
      }
    },
    reload: async () => {
      const r = await fetch("/api/household/config/");
      if (!r.ok) return;
      const body = (await r.json()) as { config: DashboardConfig; version: number };
      get().init(body.config, body.version);
    },
    discard: () => set({ config: JSON.parse(get().saved) as DashboardConfig, status: { kind: "idle" } }),
    clearConflict: () => {
      if (get().status.kind === "conflict") set({ status: { kind: "idle" } });
    },
  }));
};

const AdminStore = createContext<StoreApi<AdminState> | null>(null);

export function AdminProvider({ config, version, children }: { config: DashboardConfig; version: number; children: ReactNode }) {
  const [store] = useState(() => createAdminStore(config, version));
  return createElement(AdminStore.Provider, { value: store }, children);
}

export function useAdmin<T>(selector: (s: AdminState) => T): T {
  const store = useContext(AdminStore);
  if (!store) throw new Error("useAdmin needs an AdminProvider");
  return useStore(store, selector);
}

export const useDirty = () => useAdmin((s) => JSON.stringify(s.config) !== s.saved);

/** A short unique id for a new widget, view or theme. */
export function newId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}
