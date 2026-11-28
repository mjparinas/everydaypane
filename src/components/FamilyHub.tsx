"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";

import { useFamilyAuth, useFamilyFetch } from "@/components/FamilyAuth";

// One list at a time on the family pages (Melvin, 2026-11-28: the kitchen edit screen "seems a bit busy and not easy
// to use"). /family/ and `/d/<token>/edit/` used to stack the board, whiteboard, photos, a week of meals and the
// shopping list on one 5,000-pixel scroll. Now each is a tab: a bar along the bottom on a phone (thumb reach, like the
// household panel) and a row under the header from md up. The tab is kept in the address hash (`#shopping`), so a
// bookmark or a link from the wall opens the right one, and a tab once opened stays mounted so a half-typed note or
// item survives a look at another list.

export type FamilyTabId = "messages" | "calendar" | "shopping" | "meals" | "draw" | "photos";

export interface FamilyTab {
  id: FamilyTabId;
  label: string;
  /** Wider than the phone column (the meal week packs two or three days across on a big screen). */
  wide?: boolean;
  content: ReactNode;
}

const ICONS: Record<FamilyTabId, ReactNode> = {
  messages: <path d="M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-7l-4.5 3.5V16H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" />,
  calendar: (
    <>
      <rect x="4" y="5.5" width="16" height="14" rx="2" />
      <path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" />
    </>
  ),
  shopping: (
    <>
      <path d="M9 7h11M9 12h11M9 17h11" />
      <path d="m3.8 7 1 1 1.7-2M3.8 12l1 1 1.7-2" />
      <circle cx="5" cy="17" r="1" />
    </>
  ),
  meals: (
    <>
      <path d="M3.5 12h17a8.5 8.5 0 0 1-17 0Z" />
      <path d="M9 4.5c-.8 1 .8 2 0 3M13 4.5c-.8 1 .8 2 0 3" />
    </>
  ),
  draw: (
    <>
      <path d="m14.5 5.5 4 4L9 19H5v-4l9.5-9.5Z" />
      <path d="m12.5 7.5 4 4" />
    </>
  ),
  photos: (
    <>
      <rect x="3.5" y="5" width="17" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.5" />
      <path d="m20.5 16-4.5-4.5L7 19" />
    </>
  ),
};

function TabIcon({ id }: { id: FamilyTabId }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICONS[id]}
    </svg>
  );
}

function fromHash(tabs: FamilyTab[]): FamilyTabId | null {
  const id = window.location.hash.slice(1);
  return tabs.some((t) => t.id === id) ? (id as FamilyTabId) : null;
}

// Photos is a tab only once an admin opens an album to the family; until then there's nothing to do there.
function useFamilyAlbums(): boolean {
  const familyFetch = useFamilyFetch();
  const { displayToken } = useFamilyAuth();
  const [any, setAny] = useState(false);
  useEffect(() => {
    let live = true;
    familyFetch("/api/family/photos/")
      .then((r) => (r.ok ? (r.json() as Promise<{ albums?: unknown[] }>) : { albums: [] }))
      .then((b) => live && setAny(Boolean(b.albums?.length)))
      .catch(() => undefined);
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per token
  }, [displayToken]);
  return any;
}

export function FamilyHub({ tabs: all, footer }: { tabs: FamilyTab[]; footer?: ReactNode }) {
  const albums = useFamilyAlbums();
  const tabs = useMemo(() => all.filter((t) => t.id !== "photos" || albums), [all, albums]);
  const first = tabs[0]?.id ?? "messages";
  const [active, setActive] = useState<FamilyTabId>(first);
  const [opened, setOpened] = useState<Set<FamilyTabId>>(() => new Set([first]));

  useEffect(() => {
    const sync = () => {
      const id = fromHash(tabs) ?? first;
      setActive(id);
      setOpened((o) => (o.has(id) ? o : new Set(o).add(id)));
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, [tabs, first]);

  function go(id: FamilyTabId) {
    setActive(id);
    setOpened((o) => (o.has(id) ? o : new Set(o).add(id)));
    history.replaceState(null, "", id === first ? window.location.pathname + window.location.search : `#${id}`);
    window.scrollTo({ top: 0 });
  }

  const current = tabs.find((t) => t.id === active) ?? tabs[0];

  return (
    <>
      <nav
        aria-label="Lists"
        className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-panel/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:sticky md:top-0 md:mx-auto md:w-full md:max-w-5xl md:border-t-0 md:border-b md:bg-bg/95"
      >
        <ul className="grid md:flex md:justify-center md:gap-1" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
          {tabs.map((t) => {
            const on = t.id === active;
            return (
              <li key={t.id} className="min-w-0">
                <button
                  type="button"
                  aria-current={on ? "page" : undefined}
                  onClick={() => go(t.id)}
                  className={`grid min-h-14 w-full min-w-0 place-items-center gap-0.5 px-1 pt-1.5 pb-1 text-xs font-semibold md:flex md:min-h-11 md:gap-2 md:rounded-xl md:px-3 md:py-2 md:text-sm ${
                    on ? "text-brand md:bg-brand/10" : "text-soft hover:text-ink"
                  }`}
                >
                  <TabIcon id={t.id} />
                  <span className="max-w-full truncate">{t.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
      {tabs.map((t) =>
        opened.has(t.id) ? (
          <section
            key={t.id}
            hidden={t.id !== current?.id}
            aria-labelledby={`tab-${t.id}`}
            className={`mx-auto grid w-full gap-3 ${t.wide ? "max-w-5xl" : "max-w-xl"}`}
          >
            <h2 id={`tab-${t.id}`} className="sr-only">
              {t.label}
            </h2>
            {t.content}
          </section>
        ) : null,
      )}
      {footer}
    </>
  );
}
