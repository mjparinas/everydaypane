"use client";

import { useEffect, useMemo, useState } from "react";

import { familyAuthError, useFamilyAuth, useFamilyFetch } from "@/components/FamilyAuth";
import { CHORE_PERIODS, PERIOD_LABELS, type ChorePeriod } from "@/lib/chores";
import type { ChoresData } from "@/lib/display/types";

// Kids phone chore chart (Melvin, 2026-11-23): pick your name, tick today's chores, redeem stars. Used by
// `/family/chores/` and `/d/<token>/chores/`. Parents still edit the chart in Settings › Chores.

const PERSON_KEY = "everydaypane.chores.person";

type Pending = { kind: "toggle"; chore: string; person: string; done: boolean } | { kind: "redeem"; reward: string; person: string };

export function KidsChores() {
  const familyFetch = useFamilyFetch();
  const { displayToken } = useFamilyAuth();
  const viaDisplay = Boolean(displayToken);
  const [board, setBoard] = useState<ChoresData | null>(null);
  const [personId, setPersonId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [pin, setPin] = useState("");

  async function load(): Promise<ChoresData | string> {
    try {
      const r = await familyFetch("/api/family/chores/");
      if (!r.ok) return familyAuthError(r.status, viaDisplay, "Couldn't load chores.");
      return (await r.json()) as ChoresData;
    } catch {
      return "No connection.";
    }
  }

  useEffect(() => {
    let live = true;
    void load().then((data) => {
      if (!live) return;
      if (typeof data === "string") {
        setError(data);
        return;
      }
      setBoard(data);
      setError("");
      const saved = typeof window !== "undefined" ? window.localStorage.getItem(PERSON_KEY) : null;
      if (saved && data.people.some((p) => p.id === saved)) setPersonId(saved);
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per token
  }, [displayToken]);

  const person = board?.people.find((p) => p.id === personId) ?? null;

  const mine = useMemo(() => {
    if (!board || !person) return [];
    return board.due
      .filter((d) => d.personId === person.id)
      .map((d) => {
        const chore = board.chores.find((c) => c.id === d.choreId);
        return chore ? { ...chore, done: d.done } : null;
      })
      .filter((c): c is NonNullable<typeof c> => Boolean(c));
  }, [board, person]);

  const byPeriod = useMemo(() => {
    const groups: { period: ChorePeriod; items: typeof mine }[] = [];
    for (const period of CHORE_PERIODS) {
      const items = mine.filter((c) => c.period === period);
      if (items.length) groups.push({ period, items });
    }
    return groups;
  }, [mine]);

  function pickPerson(id: string) {
    setPersonId(id);
    window.localStorage.setItem(PERSON_KEY, id);
  }

  async function errorOf(r: Response, fallback: string): Promise<string> {
    if (r.status === 401) return familyAuthError(401, viaDisplay, fallback);
    const body = (await r.json().catch(() => null)) as { error?: unknown } | null;
    return typeof body?.error === "string" ? body.error : fallback;
  }

  async function post(body: Record<string, unknown>): Promise<string | null> {
    try {
      const r = await familyFetch("/api/family/chores/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) return errorOf(r, "Couldn't update that.");
      const next = await load();
      if (typeof next === "string") return next;
      setBoard(next);
      setError("");
      return null;
    } catch {
      return "No connection.";
    }
  }

  async function runPending(p: Pending, pinValue?: string) {
    setBusy(true);
    setError("");
    const body =
      p.kind === "toggle"
        ? { chore: p.chore, person: p.person, done: p.done, ...(pinValue ? { pin: pinValue } : {}) }
        : { redeem: p.reward, person: p.person, ...(pinValue ? { pin: pinValue } : {}) };
    const err = await post(body);
    setBusy(false);
    if (err === "Wrong PIN.") {
      setPending(p);
      setPin("");
      setError(err);
      return;
    }
    if (err) {
      setError(err);
      setPending(null);
      return;
    }
    setPending(null);
    setPin("");
  }

  function onToggle(choreId: string, done: boolean) {
    if (!person) return;
    const next = { kind: "toggle" as const, chore: choreId, person: person.id, done };
    if (!done && board?.pinSet) {
      setPending(next);
      setPin("");
      setError("");
      return;
    }
    void runPending(next);
  }

  function onRedeem(rewardId: string) {
    if (!person) return;
    const next = { kind: "redeem" as const, reward: rewardId, person: person.id };
    if (board?.pinSet) {
      setPending(next);
      setPin("");
      setError("");
      return;
    }
    void runPending(next);
  }

  if (!board && !error) {
    return <p className="text-sm text-soft">Loading chores…</p>;
  }

  if (!board) {
    return <p className="text-sm text-bad">{error}</p>;
  }

  if (!board.people.length) {
    return <p className="text-sm text-soft">No kids on the chore chart yet. Ask a parent to add them in Settings › Chores.</p>;
  }

  if (!person) {
    return (
      <div className="grid gap-3">
        <p className="text-sm text-soft">Who are you?</p>
        <div className="grid grid-cols-2 gap-3">
          {board.people.map((p) => (
            <button
              key={p.id}
              type="button"
              className="card flex min-h-24 flex-col items-center justify-center gap-1 text-center"
              style={{ borderColor: p.color, borderWidth: 2 }}
              onClick={() => pickPerson(p.id)}
            >
              <span className="text-3xl" aria-hidden="true">
                {p.emoji || "⭐"}
              </span>
              <span className="font-bold">{p.name}</span>
            </button>
          ))}
        </div>
        {error ? <p className="text-sm text-bad">{error}</p> : null}
      </div>
    );
  }

  const doneCount = mine.filter((c) => c.done).length;

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-2">
        <button type="button" className="btn-ghost" onClick={() => setPersonId(null)}>
          ← {person.emoji} {person.name}
        </button>
        <p className="text-sm text-soft">
          {person.available}★ available
          {person.goal > 0 ? ` · goal ${person.goal}` : ""}
        </p>
      </div>

      {mine.length === 0 ? (
        <p className="text-sm text-soft">Nothing due today. Nice!</p>
      ) : (
        <div className="grid gap-4">
          <p className="text-sm text-soft">
            {doneCount}/{mine.length} done today
          </p>
          {byPeriod.map(({ period, items }) => (
            <section key={period} className="grid gap-2" aria-labelledby={`period-${period}`}>
              <h3 id={`period-${period}`} className="text-sm font-bold text-soft">
                {PERIOD_LABELS[period]}
              </h3>
              <ul className="grid gap-2">
                {items.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      disabled={busy}
                      className={`card flex w-full items-center gap-3 text-left ${c.done ? "opacity-60" : ""}`}
                      onClick={() => onToggle(c.id, !c.done)}
                      aria-pressed={c.done}
                    >
                      <span className="text-2xl" aria-hidden="true">
                        {c.done ? "✓" : c.emoji || "·"}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={`font-semibold ${c.done ? "line-through" : ""}`}>{c.name}</span>
                        <span className="ml-2 text-sm text-soft">{c.stars}★</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {board.rewards.length > 0 ? (
        <section className="grid gap-2" aria-labelledby="rewards-heading">
          <h3 id="rewards-heading" className="text-sm font-bold text-soft">
            Star Rewards
          </h3>
          <ul className="grid gap-2">
            {board.rewards.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  disabled={busy || person.available < r.starsCost}
                  className="card flex w-full items-center justify-between gap-2 text-left disabled:opacity-40"
                  onClick={() => onRedeem(r.id)}
                >
                  <span className="font-semibold">{r.name}</span>
                  <span className="text-sm text-soft">{r.starsCost}★</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {pending ? (
        <div className="card grid gap-3" role="dialog" aria-labelledby="pin-heading">
          <h3 id="pin-heading" className="font-bold">
            Parent PIN
          </h3>
          <p className="text-sm text-soft">
            {pending.kind === "toggle" ? "Unchecking a chore needs the PIN." : "Redeeming a reward needs the PIN."}
          </p>
          <input
            className="field"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={4}
            placeholder="••••"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
            aria-label="Parent PIN"
          />
          <div className="flex gap-2">
            <button type="button" className="btn-ghost" disabled={busy} onClick={() => setPending(null)}>
              Cancel
            </button>
            <button type="button" className="btn" disabled={busy || pin.length !== 4} onClick={() => void runPending(pending, pin)}>
              Confirm
            </button>
          </div>
        </div>
      ) : null}

      {error ? <p className="text-sm text-bad">{error}</p> : null}
    </div>
  );
}
