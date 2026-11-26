"use client";

import { useEffect, useState, type FormEvent } from "react";

import { familyAuthError, useFamilyAuth, useFamilyFetch } from "@/components/FamilyAuth";
import type { ShoppingData, ShoppingItem } from "@/lib/display/types";

// The family shopping list (Melvin, 2026-11-22), for phones: add an item, tick it off, remove it, clear what's
// bought, or pull in this week's meals. Displays show it within a minute. Used by /family/, the admin Shopping tab,
// and `/d/<token>/edit/`.

export function ShoppingList() {
  const familyFetch = useFamilyFetch();
  const { displayToken } = useFamilyAuth();
  const viaDisplay = Boolean(displayToken);
  const [items, setItems] = useState<ShoppingItem[] | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function fetchList(): Promise<ShoppingItem[] | string> {
    try {
      const r = await familyFetch("/api/shopping/");
      if (!r.ok) return familyAuthError(r.status, viaDisplay, "Couldn't load the list.");
      return ((await r.json()) as ShoppingData).items;
    } catch {
      return "No connection.";
    }
  }

  async function errorOf(r: Response, fallback: string): Promise<string> {
    if (r.status === 401) return familyAuthError(401, viaDisplay, fallback);
    const body = (await r.json().catch(() => null)) as { error?: unknown } | null;
    return typeof body?.error === "string" ? body.error : fallback;
  }

  function show(list: ShoppingItem[] | string) {
    if (typeof list === "string") return setError(list);
    setItems(list);
    setError("");
  }

  useEffect(() => {
    let live = true;
    void fetchList().then((list) => live && show(list));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per token
  }, [displayToken]);

  async function reload() {
    show(await fetchList());
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    const next = text.trim();
    if (!next) return;
    setBusy(true);
    setNote("");
    try {
      const r = await familyFetch("/api/shopping/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: next }),
      });
      if (!r.ok) return setError(await errorOf(r, "Couldn't add that."));
      setText("");
      await reload();
    } catch {
      setError("No connection. That item wasn't added.");
    } finally {
      setBusy(false);
    }
  }

  async function toggle(item: ShoppingItem) {
    setBusy(true);
    setNote("");
    try {
      const r = await familyFetch(`/api/shopping/${encodeURIComponent(item.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ done: !item.done }),
      });
      if (!r.ok) return setError(await errorOf(r, "Couldn't update that."));
      await reload();
    } catch {
      setError("No connection. That change wasn't saved.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(item: ShoppingItem) {
    setBusy(true);
    setNote("");
    try {
      const r = await familyFetch(`/api/shopping/${encodeURIComponent(item.id)}`, { method: "DELETE" });
      if (!r.ok) return setError(await errorOf(r, "Couldn't remove that."));
      await reload();
    } catch {
      setError("No connection. That item is still on the list.");
    } finally {
      setBusy(false);
    }
  }

  async function clearBought() {
    setBusy(true);
    setNote("");
    try {
      const r = await familyFetch("/api/shopping/?done=1", { method: "DELETE" });
      if (!r.ok) return setError(await errorOf(r, "Couldn't clear bought items."));
      await reload();
    } catch {
      setError("No connection. Bought items are still on the list.");
    } finally {
      setBusy(false);
    }
  }

  async function fromMeals() {
    setBusy(true);
    setNote("");
    try {
      const r = await familyFetch("/api/shopping/from-meals/", { method: "POST" });
      if (!r.ok) return setError(await errorOf(r, "Couldn't add meals."));
      const body = (await r.json()) as { added?: number };
      const added = body.added ?? 0;
      setNote(
        added === 0
          ? "Nothing new. Those meals are already on the list."
          : added === 1
            ? "Added 1 item from this week's meals."
            : `Added ${added} items from this week's meals.`,
      );
      await reload();
    } catch {
      setError("No connection. Meals weren't added.");
    } finally {
      setBusy(false);
    }
  }

  if (!items) return <p className="text-sm text-soft">{error || "Loading…"}</p>;
  const open = items.filter((i) => !i.done);
  const done = items.filter((i) => i.done);

  return (
    <div className="grid gap-3">
      <p className="text-sm text-soft">The wall shows this list and can tick items off.</p>
      <form className="flex gap-2" onSubmit={(e) => void add(e)}>
        <label className="min-w-0 flex-1">
          <span className="sr-only">New item</span>
          <input
            className="field"
            value={text}
            maxLength={80}
            placeholder="Milk, bread, apples"
            onChange={(e) => setText(e.target.value)}
          />
        </label>
        <button className="btn-primary" disabled={busy || !text.trim()}>
          Add
        </button>
      </form>
      {error && (
        <p className="text-sm text-bad" role="alert">
          {error}
        </p>
      )}
      {note && <p className="text-sm text-soft">{note}</p>}
      {items.length === 0 ? (
        <p className="text-sm text-soft">Nothing on the list yet.</p>
      ) : (
        <ul className="grid gap-1" aria-label="Shopping items">
          {[...open, ...done].map((item) => (
            <li key={item.id} className="flex items-center gap-2">
              <label className="flex min-w-0 flex-1 items-center gap-3 py-2">
                <input
                  type="checkbox"
                  className="h-5 w-5 shrink-0 accent-brand"
                  checked={item.done}
                  disabled={busy}
                  aria-label={item.done ? `Put ${item.text} back on the list` : `Mark ${item.text} bought`}
                  onChange={() => void toggle(item)}
                />
                <span className={item.done ? "min-w-0 flex-1 truncate text-soft line-through" : "min-w-0 flex-1 truncate"}>
                  {item.text}
                </span>
              </label>
              <button
                type="button"
                className="btn-ghost px-3"
                disabled={busy}
                aria-label={`Remove ${item.text}`}
                onClick={() => void remove(item)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-ghost" disabled={busy} onClick={() => void fromMeals()}>
          Add from This Week&apos;s Meals
        </button>
        {done.length > 0 && (
          <button type="button" className="btn-ghost" disabled={busy} onClick={() => void clearBought()}>
            Clear Bought
          </button>
        )}
      </div>
    </div>
  );
}
