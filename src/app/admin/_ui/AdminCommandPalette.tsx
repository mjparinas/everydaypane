"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { ADMIN_TABS, adminTabLabel, type AdminTab } from "@/lib/adminTabs";

type Hit = { id: string; name: string; plan: string; members: { email: string }[] };

type Row =
  | { kind: "tab"; tab: AdminTab; label: string; hint: string }
  | { kind: "jump"; id: string; label: string; hint: string; tab: AdminTab }
  | { kind: "household"; id: string; label: string; hint: string };

async function searchHouseholds(q: string, signal: AbortSignal): Promise<Hit[]> {
  const r = await fetch(`/api/admin/households/?q=${encodeURIComponent(q)}`, {
    headers: { "Content-Type": "application/json" },
    signal,
  });
  if (!r.ok) return [];
  const body = (await r.json()) as { households: Hit[] };
  return body.households.slice(0, 12);
}

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

export function AdminCommandPalette({
  open,
  onOpenChange,
  onGoTab,
  onOpenHousehold,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGoTab: (tab: AdminTab) => void;
  onOpenHousehold: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenChange(!open);
        return;
      }
      if (e.key === "/" && !meta && !e.altKey && !isTypingTarget(e.target)) {
        e.preventDefault();
        onOpenChange(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (!open) {
      setQ("");
      setHits([]);
      setActive(0);
      return;
    }
    const t = window.setTimeout(() => inputRef.current?.focus(), 20);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      setHits([]);
      setLoading(false);
      return;
    }
    const ac = new AbortController();
    setLoading(true);
    const timer = window.setTimeout(() => {
      void searchHouseholds(trimmed, ac.signal)
        .then((list) => {
          setHits(list);
          setLoading(false);
        })
        .catch(() => {
          if (!ac.signal.aborted) {
            setHits([]);
            setLoading(false);
          }
        });
    }, 280);
    return () => {
      window.clearTimeout(timer);
      ac.abort();
    };
  }, [q, open]);

  const rows: Row[] = useMemo(() => {
    const trimmed = q.trim().toLowerCase();
    const tabs: Row[] = ADMIN_TABS.filter(
      (tab) => !trimmed || adminTabLabel(tab).toLowerCase().includes(trimmed) || tab.toLowerCase().includes(trimmed),
    ).map((tab) => ({
      kind: "tab" as const,
      tab,
      label: adminTabLabel(tab),
      hint: "Section",
    }));
    const jumps: Row[] = [];
    if (!trimmed || "to do".includes(trimmed) || "todo".includes(trimmed)) {
      jumps.push({ kind: "jump", id: "todo", label: "To Do", hint: "Needs attention", tab: "To Do" });
    }
    if (!trimmed || "report".includes(trimmed)) {
      jumps.push({ kind: "jump", id: "reports", label: "Reports", hint: "Customer reports", tab: "Reports" });
    }
    const households: Row[] = hits.map((h) => ({
      kind: "household" as const,
      id: h.id,
      label: h.name,
      hint: `${h.plan === "paid" ? "Household" : "Free"} · ${
        h.members
          .map((m) => m.email)
          .slice(0, 2)
          .join(", ") || h.id
      }`,
    }));
    if (trimmed.length >= 2) return [...households, ...tabs];
    return [...jumps, ...tabs];
  }, [q, hits]);

  useEffect(() => {
    setActive(0);
  }, [rows.length, q]);

  function run(row: Row) {
    onOpenChange(false);
    if (row.kind === "tab") onGoTab(row.tab);
    else if (row.kind === "jump") onGoTab(row.tab);
    else onOpenHousehold(row.id);
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-start justify-center bg-ink/40 px-4 pt-[12vh]"
      role="presentation"
      onMouseDown={() => onOpenChange(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-line bg-panel shadow-lg"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="border-b border-line px-3 py-2">
          <input
            ref={inputRef}
            className="field w-full border-0 bg-transparent shadow-none focus:ring-0"
            placeholder="Jump to a section or find a household…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                onOpenChange(false);
              } else if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((i) => Math.min(i + 1, Math.max(rows.length - 1, 0)));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                const row = rows[active];
                if (row) run(row);
              }
            }}
            aria-autocomplete="list"
            aria-controls="admin-cmd-list"
          />
          <p className="mt-1 px-1 text-[0.7rem] text-soft">
            <kbd className="rounded border border-line px-1">⌘K</kbd> or <kbd className="rounded border border-line px-1">Ctrl+K</kbd>
            {" · "}
            Esc to close
            {loading ? " · Searching…" : ""}
          </p>
        </div>
        <ul id="admin-cmd-list" role="listbox" className="max-h-[min(24rem,50vh)] overflow-y-auto py-1">
          {rows.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-soft">
              {q.trim().length >= 2 ? "No households or sections match." : "Type a section name or household…"}
            </li>
          )}
          {rows.map((row, i) => (
            <li key={`${row.kind}-${row.kind === "tab" ? row.tab : row.id}`} role="option" aria-selected={i === active}>
              <button
                type="button"
                className={`flex w-full items-baseline justify-between gap-3 px-4 py-2.5 text-left text-sm ${
                  i === active ? "bg-brand/10 text-ink" : "hover:bg-bg"
                }`}
                onMouseEnter={() => setActive(i)}
                onClick={() => run(row)}
              >
                <span className="min-w-0 truncate font-semibold">{row.label}</span>
                <span className="shrink-0 text-xs text-soft">{row.hint}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
