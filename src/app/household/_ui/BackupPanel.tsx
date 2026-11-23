"use client";

import { useState } from "react";

import type { DashboardConfig } from "@/lib/config/schema";

import { Toggle } from "./fields";
import { describeIssue, useAdmin, useDirty } from "./store";

// Settings › Backup (Melvin, 2026-11-21): download every setting as a file, and restore one. A restore is checked by
// the server first and only replaces the settings after the admin confirms what the file holds.

interface Summary {
  views: number;
  widgets: number;
  themes: number;
}

interface Pending {
  name: string;
  backup: unknown;
  summary: Summary;
  exportedAt: string | null;
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

function exportedOn(backup: unknown): string | null {
  const at = (backup as { exportedAt?: unknown } | null)?.exportedAt;
  if (typeof at !== "string" || Number.isNaN(Date.parse(at))) return null;
  return new Date(at).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" });
}

export function BackupPanel() {
  const version = useAdmin((s) => s.version);
  const config = useAdmin((s) => s.config);
  const init = useAdmin((s) => s.init);
  const dirty = useDirty();
  const [wifi, setWifi] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  async function post(backup: unknown, dryRun: boolean) {
    const r = await fetch("/api/household/backup/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ baseVersion: version, backup, dryRun }),
    });
    const body = (await r.json().catch(() => ({}))) as {
      error?: string;
      issues?: unknown;
      summary?: Summary;
      version?: number;
      config?: DashboardConfig;
    };
    return { r, body };
  }

  async function pick(file: File | undefined) {
    setError("");
    setDone("");
    setPending(null);
    if (!file) return;
    if (file.size > 2_000_000) return setError("That file is too big to be a settings backup.");
    let backup: unknown;
    try {
      backup = JSON.parse(await file.text()) as unknown;
    } catch {
      return setError("That file isn't a settings backup (it isn't JSON).");
    }
    setBusy(true);
    try {
      const { r, body } = await post(backup, true);
      if (r.ok && body.summary) setPending({ name: file.name, backup, summary: body.summary, exportedAt: exportedOn(backup) });
      else if (r.status === 401) setError("You've been signed out. Sign in again to restore.");
      else
        setError(
          body.issues ? `${body.error ?? "Not valid."} ${describeIssue(config, body.issues)}` : (body.error ?? "Couldn't read that file."),
        );
    } catch {
      setError("No connection. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function restore() {
    if (!pending) return;
    setBusy(true);
    setError("");
    try {
      const { r, body } = await post(pending.backup, false);
      if (r.ok && body.config && typeof body.version === "number") {
        init(body.config, body.version);
        setPending(null);
        setDone(`Restored ${pending.name}. Displays pick it up within 30 seconds.`);
      } else if (r.status === 409) {
        setError("Someone else saved settings just now. Reload the page, then restore again.");
      } else {
        setError(body.error ?? "Couldn't restore. Try again.");
      }
    } catch {
      setError("No connection. Nothing was changed; try again.");
    } finally {
      setBusy(false);
    }
  }

  const s = pending?.summary;
  return (
    <section id="settings-backup-card" className="card grid scroll-mt-28 content-start gap-4">
      <h2 className="text-lg font-semibold">Backup</h2>
      <p className="text-xs text-soft">
        Every view, widget, theme, schedule and integration setting, in one file. Sign-ins and tokens, calendar link addresses, display
        addresses, meals, messages and library photos stay on the server and aren&apos;t in it.
      </p>
      <Toggle
        label="Include WiFi passwords"
        checked={wifi}
        onChange={setWifi}
        hint={
          wifi
            ? "Keep the file somewhere private: anyone with it can read the WiFi password."
            : "Left out, a restore keeps the WiFi password this dashboard already has."
        }
      />
      {dirty && <p className="text-xs text-bad">You have unsaved changes. The backup has the last saved settings, so save first.</p>}
      <div className="flex flex-wrap gap-2">
        <a className="btn-primary" href={`/api/household/backup/${wifi ? "?wifi=1" : ""}`} download>
          Download backup
        </a>
        <label className={`btn-ghost cursor-pointer ${busy ? "pointer-events-none opacity-50" : ""}`}>
          Restore from a file
          <input
            type="file"
            accept="application/json,.json"
            className="sr-only"
            disabled={busy}
            onChange={(e) => {
              void pick(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      {pending && s && (
        <div className="grid gap-3 rounded-xl border border-line p-3" data-testid="restore-confirm">
          <p className="text-sm">
            <strong>{pending.name}</strong> has {plural(s.views, "view")}, {plural(s.widgets, "widget")} and {plural(s.themes, "theme")}
            {pending.exportedAt ? `, saved ${pending.exportedAt}` : ""}. Restoring replaces every setting on this dashboard
            {dirty ? ", and your unsaved changes here are lost" : ""}.
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-primary" disabled={busy} onClick={() => void restore()}>
              Restore these settings
            </button>
            <button type="button" className="btn-ghost" disabled={busy} onClick={() => setPending(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {done && (
        <p className="text-sm" role="status">
          {done}
        </p>
      )}
      {error && (
        <p className="text-sm text-bad" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
