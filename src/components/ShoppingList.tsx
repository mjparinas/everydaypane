"use client";

import { useEffect, useState, type FormEvent } from "react";

import { familyAuthError, useFamilyAuth, useFamilyFetch } from "@/components/FamilyAuth";
import type { ShoppingData, ShoppingItem } from "@/lib/display/types";
import { groupByCategory, SHOPPING_CATEGORIES, SHOPPING_CATEGORY_LABELS, type ShoppingCategory } from "@/lib/shopping";
import { guessCategory } from "@/lib/shoppingGuess";

// The family shopping list (Melvin, 2026-11-22), for phones: add an item, tick it off, remove it, clear what's
// bought, or pull in this week's meals. Displays show it within a minute. Used by /family/, the admin Shopping tab,
// and `/d/<token>/edit/`. Open items are grouped by aisle; each can move aisle or be marked running low (Melvin,
// 2026-11-26).

export function ShoppingList() {
  const familyFetch = useFamilyFetch();
  const { displayToken } = useFamilyAuth();
  const viaDisplay = Boolean(displayToken);
  const [items, setItems] = useState<ShoppingItem[] | null>(null);
  const [text, setText] = useState("");
  const [low, setLow] = useState(false);
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
        body: JSON.stringify(low ? { text: next, low: true } : { text: next }),
      });
      if (!r.ok) return setError(await errorOf(r, "Couldn't add that."));
      setText("");
      setLow(false);
      await reload();
    } catch {
      setError("No connection. That item wasn't added.");
    } finally {
      setBusy(false);
    }
  }

  const toggle = (item: ShoppingItem) => patch(item, { done: !item.done });

  async function patch(item: ShoppingItem, change: { done?: boolean; low?: boolean; category?: ShoppingCategory }) {
    setBusy(true);
    setNote("");
    try {
      const r = await familyFetch(`/api/shopping/${encodeURIComponent(item.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(change),
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
      <p className="text-sm text-soft">
        The wall shows this list and can tick items off. Mark something <strong>Low</strong> when there&apos;s still some left.
      </p>
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
        <button
          type="button"
          className={low ? "btn-ghost border-amber-400 bg-amber-100 text-amber-900" : "btn-ghost"}
          aria-pressed={low}
          title="Still some left, pick it up if you're there"
          onClick={() => setLow((v) => !v)}
        >
          Low
        </button>
        <button className="btn-primary" disabled={busy || !text.trim()}>
          Add
        </button>
      </form>
      {text.trim() && (
        <p className="-mt-1 text-xs text-soft">Goes under {SHOPPING_CATEGORY_LABELS[guessCategory(text)]}. You can move it after.</p>
      )}
      {error && (
        <p className="text-sm text-bad" role="alert">
          {error}
        </p>
      )}
      {note && <p className="text-sm text-soft">{note}</p>}
      {items.length === 0 ? (
        <p className="text-sm text-soft">Nothing on the list yet.</p>
      ) : (
        <div className="grid gap-3">
          {groupByCategory(open).map((g) => (
            <section key={g.category} aria-label={SHOPPING_CATEGORY_LABELS[g.category]}>
              <h3 className="text-xs font-bold tracking-wide text-soft uppercase">{SHOPPING_CATEGORY_LABELS[g.category]}</h3>
              <ul className="grid gap-1">
                {g.items.map((item) => (
                  <Row key={item.id} item={item} busy={busy} onToggle={toggle} onPatch={patch} onRemove={remove} />
                ))}
              </ul>
            </section>
          ))}
          {done.length > 0 && (
            <section aria-label="Bought">
              <h3 className="text-xs font-bold tracking-wide text-soft uppercase">Bought</h3>
              <ul className="grid gap-1">
                {done.map((item) => (
                  <Row key={item.id} item={item} busy={busy} onToggle={toggle} onPatch={patch} onRemove={remove} />
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-ghost" disabled={busy} onClick={() => void fromMeals()}>
          Add from this week&apos;s meals
        </button>
        {done.length > 0 && (
          <button type="button" className="btn-ghost" disabled={busy} onClick={() => void clearBought()}>
            Clear bought
          </button>
        )}
      </div>
    </div>
  );
}

function Row({
  item,
  busy,
  onToggle,
  onPatch,
  onRemove,
}: {
  item: ShoppingItem;
  busy: boolean;
  onToggle: (item: ShoppingItem) => Promise<void>;
  onPatch: (item: ShoppingItem, change: { low?: boolean; category?: ShoppingCategory }) => Promise<void>;
  onRemove: (item: ShoppingItem) => Promise<void>;
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-2">
      <label className="flex min-w-0 flex-1 items-center gap-3 py-2">
        <input
          type="checkbox"
          className="h-5 w-5 shrink-0 accent-brand"
          checked={item.done}
          disabled={busy}
          aria-label={item.done ? `Put ${item.text} back on the list` : `Mark ${item.text} bought`}
          onChange={() => void onToggle(item)}
        />
        <span className={item.done ? "min-w-0 flex-1 truncate text-soft line-through" : "min-w-0 flex-1 truncate"}>{item.text}</span>
      </label>
      {!item.done && (
        <>
          <button
            type="button"
            className={item.low ? "btn-ghost border-amber-400 bg-amber-100 px-3 text-amber-900" : "btn-ghost px-3"}
            disabled={busy}
            aria-pressed={item.low}
            aria-label={item.low ? `${item.text}: running low. Tap if it's run out` : `Mark ${item.text} running low`}
            onClick={() => void onPatch(item, { low: !item.low })}
          >
            Low
          </button>
          <label>
            <span className="sr-only">Aisle for {item.text}</span>
            <select
              className="field w-auto py-1 text-xs"
              value={item.category}
              disabled={busy}
              onChange={(e) => void onPatch(item, { category: e.target.value as ShoppingCategory })}
            >
              {SHOPPING_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {SHOPPING_CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </label>
        </>
      )}
      <button
        type="button"
        className="btn-ghost px-3"
        disabled={busy}
        aria-label={`Remove ${item.text}`}
        onClick={() => void onRemove(item)}
      >
        Remove
      </button>
    </li>
  );
}
