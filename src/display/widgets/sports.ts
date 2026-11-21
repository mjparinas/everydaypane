import type { SportsData, SportsGame, SportsTeamData } from "@/lib/display/types";

import { subscribe } from "../api";
import { fill, h } from "../dom";
import { fmt, isoDate, shortTime } from "../format";
import { everyMinute } from "../ticker";
import type { Mount } from "./types";

// Sports scores (Melvin, 2026-11-21): one row per followed team, in its colour. A game on now shows its live score; a
// game that finished in the last ten hours shows the result (so last night's game is still there at breakfast);
// otherwise the next game's day and time. A score that just changed flashes once.

const RECENT_MS = 10 * 3_600_000;
const DAY_MS = 86_400_000;

const dayNumber = (iso: string) => Math.round(Date.parse(`${iso}T00:00:00Z`) / DAY_MS);

/** "Sat Nov 29". */
export function dateLabel(start: number, timeZone: string): string {
  const at = new Date(start);
  const part = (o: Intl.DateTimeFormatOptions) => fmt(timeZone, o).format(at).replace(".", "");
  return `${part({ weekday: "short" })} ${part({ month: "short" })} ${part({ day: "numeric" })}`;
}

/** "Today 7 PM", "Tomorrow 4:30 PM", "Sat 7 PM" within the week, "Sat Nov 29" further out. */
export function when(start: number, now: Date, timeZone: string, hour12: boolean): string {
  const at = new Date(start);
  const days = dayNumber(isoDate(at, timeZone)) - dayNumber(isoDate(now, timeZone));
  const time = shortTime(`T${fmt(timeZone, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(at)}`, hour12);
  const weekday = fmt(timeZone, { weekday: "short" }).format(at).replace(".", "");
  if (days === 0) return `Today ${time}`;
  if (days === 1) return `Tomorrow ${time}`;
  if (days > 1 && days < 7) return `${weekday} ${time}`;
  return dateLabel(start, timeZone);
}

const sides = (g: SportsGame) => (g.us === "home" ? { us: g.home, them: g.away } : { us: g.away, them: g.home });

/** The followed team's score first: "3–2". */
export function score(g: SportsGame): string {
  const { us, them } = sides(g);
  return `${us.score ?? "0"}–${them.score ?? "0"}`;
}

/** W, L, or D for a draw in soccer (T elsewhere). */
export function result(g: SportsGame, league: string): string {
  const { us, them } = sides(g);
  const a = Number(us.score);
  const b = Number(them.score);
  if (Number.isNaN(a) || Number.isNaN(b)) return "";
  if (a === b) return ["mls", "epl", "ucl"].includes(league) ? "D" : "T";
  return a > b ? "W" : "L";
}

/** "vs TOR" at home, "@ TOR" away. */
export const opponent = (g: SportsGame) => `${g.us === "home" ? "vs" : "@"} ${sides(g).them.abbr}`;

export type Headline = "live" | "final" | "next" | "none";

export function headline(t: SportsTeamData, now: number): Headline {
  if (t.next?.state === "in") return "live";
  if (t.last && now - t.last.start < RECENT_MS) return "final";
  if (t.next) return "next";
  return t.last ? "final" : "none";
}

interface Row {
  kind: Headline | "error";
  right: string;
  sub: string[];
}

export function describe(t: SportsTeamData, now: Date, timeZone: string, hour12: boolean, showLast: boolean): Row {
  if (t.error && !t.next && !t.last) return { kind: "error", right: "–", sub: ["Scores unavailable right now"] };
  const kind = headline(t, now.getTime());
  const last = t.last ? `Last ${[result(t.last, t.league), score(t.last)].filter(Boolean).join(" ")} ${opponent(t.last)}` : "";
  const next = t.next && t.next.state === "pre" ? `Next ${when(t.next.start, now, timeZone, hour12)}` : "";
  switch (kind) {
    case "live":
      return { kind, right: score(t.next!), sub: [t.next!.detail || "Live", opponent(t.next!)] };
    case "final": {
      const g = t.last!;
      const recent = now.getTime() - g.start < RECENT_MS;
      return {
        kind,
        right: [result(g, t.league), score(g)].filter(Boolean).join(" "),
        sub: [recent ? g.detail || "Final" : dateLabel(g.start, timeZone), opponent(g), next],
      };
    }
    case "next":
      return { kind, right: when(t.next!.start, now, timeZone, hour12), sub: [opponent(t.next!), showLast ? last : ""] };
    default:
      return { kind, right: "–", sub: ["No games scheduled"] };
  }
}

export const sports: Mount<"sports"> = (el, w, ctx) => {
  const root = h("div", { class: "w-sports" }, h("div", { class: "w-empty" }, "Checking scores…"));
  el.append(root);
  let data: SportsData | null = null;
  // The last live score drawn for each team, so a change (a goal) can flash once.
  const shown = new Map<string, string>();

  const draw = (now: Date) => {
    if (!data) return;
    const teams = data.teams.filter((t) => w.teamIds.length === 0 || w.teamIds.includes(t.id));
    if (teams.length === 0) return fill(root, h("div", { class: "w-empty" }, "Follow teams under Settings › Sports."));
    fill(
      root,
      w.title ? h("div", { class: "w-label" }, w.title) : null,
      h(
        "ul",
        { class: "sp-list" },
        ...teams.map((t) => {
          const row = describe(t, now, ctx.timeZone, ctx.hour12, w.showLast);
          const before = shown.get(t.id);
          const changed = row.kind === "live" && before !== undefined && before !== row.right;
          if (row.kind === "live") shown.set(t.id, row.right);
          else shown.delete(t.id);
          return h(
            "li",
            { class: `sp-row sp-${row.kind}${changed ? " sp-new" : ""}`, style: `--team:${t.color}` },
            h("div", { class: "sp-name" }, row.kind === "live" ? h("span", { class: "sp-badge" }, "LIVE") : null, t.name),
            h("div", { class: "sp-score" }, row.right),
            h("div", { class: "sp-sub" }, row.sub.filter(Boolean).join(" · ")),
          );
        }),
      ),
    );
  };

  // Every 30 seconds: cheap, because the server reads ESPN's live scoreboard only while a game is on.
  const stopFeed = subscribe<SportsData>("sports", 30_000, (d) => {
    data = d;
    draw(new Date());
  });
  const stopTick = everyMinute(draw);
  return () => {
    stopFeed();
    stopTick();
  };
};
