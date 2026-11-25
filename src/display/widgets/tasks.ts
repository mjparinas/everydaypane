import { addDays, dayLabel, localDate } from "@/lib/calendar";
import type { TaskItem, TasksData } from "@/lib/display/types";

import { refresh, send, subscribe } from "../api";
import { fill, h } from "../dom";
import { everyMinute } from "../ticker";
import type { Mount } from "./types";

// Google Tasks (Melvin, 2026-11-17): the open tasks of the picked lists, checked every minute. A tap ticks a task off,
// but only after a few seconds, so a second tap (a child's stray finger) undoes it before Google hears about it.

export const TASKS_EVERY = 60_000;
export const UNDO_MS = 4000;

/** "Today", "Tomorrow", "Fri, Nov 20", or "Overdue" for a past due date. */
export function dueLabel(due: string, today: string): { text: string; overdue: boolean } {
  if (due < today) return { text: due === addDays(today, -1) ? "Yesterday" : "Overdue", overdue: true };
  return { text: dayLabel(due, today), overdue: false };
}

function providerLists(data: TasksData, provider: "google" | "microsoft" | "todoist") {
  return provider === "microsoft" ? data.microsoft : provider === "todoist" ? data.todoist : data.google;
}

/** The lists a widget shows (none picked means all) and their tasks, cut to `count` in all. */
export function shownLists(
  data: TasksData,
  provider: "google" | "microsoft" | "todoist",
  listIds: string[],
  count: number,
): { id: string; name: string; tasks: TaskItem[] }[] {
  let left = count;
  return providerLists(data, provider)
    .lists.filter((l) => listIds.length === 0 || listIds.includes(l.id))
    .map((l) => {
      const tasks = l.tasks.slice(0, Math.max(0, left));
      left -= tasks.length;
      return { ...l, tasks };
    });
}

export const tasks: Mount<"tasks"> = (el, w, ctx) => {
  const root = h("div", { class: "w-tasks" }, h("div", { class: "w-empty" }, "Loading tasks…"));
  el.append(root);
  let data: TasksData | null = null;
  let drawn = "";
  let message = "";
  let messageTimer: number | undefined;
  // Ticked on this screen and waiting out the undo time, then sent and hidden until the feed drops it.
  const pending = new Map<string, { listId: string; timer: number }>();
  const done = new Set<string>();

  const say = (text: string) => {
    message = text;
    draw(new Date(), true);
    window.clearTimeout(messageTimer);
    if (text) messageTimer = window.setTimeout(() => say(""), 5000);
  };

  const tap = (listId: string, taskId: string) => {
    const entry = pending.get(taskId);
    if (entry) {
      window.clearTimeout(entry.timer);
      pending.delete(taskId);
      return draw(new Date(), true);
    }
    pending.set(taskId, {
      listId,
      timer: window.setTimeout(() => {
        pending.delete(taskId);
        void send("tasks", { provider: w.provider, list: listId, task: taskId }).then((ok) => {
          if (ok) {
            done.add(taskId);
            refresh("tasks");
          }
          say(ok ? "" : "Couldn't reach Google Tasks");
        });
      }, UNDO_MS),
    });
    draw(new Date(), true);
  };

  const row = (listId: string, t: TaskItem, today: string) => {
    const due = w.showDue && t.due ? dueLabel(t.due, today) : null;
    const ticked = pending.has(t.id);
    // Checkbox mark only when ticking is on (critique P2, 2026-11-24).
    const parts = [
      w.allowCheck ? h("span", { class: "tk-box", "aria-hidden": "true" }) : null,
      h("span", { class: "tk-title" }, t.title),
      due ? h("span", { class: `tk-due${due.overdue ? " tk-overdue" : ""}` }, due.text) : null,
    ];
    const cls = `tk${t.sub ? " tk-sub" : ""}${ticked ? " tk-done" : ""}`;
    if (!w.allowCheck) return h("li", { class: cls }, ...parts);
    const b = h("button", { type: "button", class: "tk-btn", "aria-pressed": ticked ? "true" : "false" }, ...parts);
    b.addEventListener("click", (ev) => {
      ev.stopPropagation();
      tap(listId, t.id);
    });
    return h("li", { class: cls }, b);
  };

  function draw(now: Date, force = false) {
    if (!data) return;
    const feed = providerLists(data, w.provider);
    if (!feed.connected) {
      const hint =
        w.provider === "microsoft"
          ? "Connect Microsoft To Do under Settings."
          : w.provider === "todoist"
            ? "Connect Todoist under Settings."
            : "Connect Google Tasks under Settings.";
      return fill(root, h("div", { class: "w-empty" }, hint));
    }
    const today = localDate(now.getTime(), ctx.timeZone);
    const sig = `${data.updatedAt}|${today}`;
    if (!force && sig === drawn) return;
    drawn = sig;
    const visible: TasksData = {
      ...data,
      google:
        w.provider === "google"
          ? { ...feed, lists: feed.lists.map((l) => ({ ...l, tasks: l.tasks.filter((t) => !done.has(t.id)) })) }
          : data.google,
      microsoft:
        w.provider === "microsoft"
          ? { ...feed, lists: feed.lists.map((l) => ({ ...l, tasks: l.tasks.filter((t) => !done.has(t.id)) })) }
          : data.microsoft,
      todoist:
        w.provider === "todoist"
          ? { ...feed, lists: feed.lists.map((l) => ({ ...l, tasks: l.tasks.filter((t) => !done.has(t.id)) })) }
          : data.todoist,
    };
    const lists = shownLists(visible, w.provider, w.listIds, w.count);
    if (!lists.length) return fill(root, h("div", { class: "w-empty" }, "Pick task lists under Settings."));
    const several = lists.length > 1;
    const empty = lists.every((l) => l.tasks.length === 0);
    fill(
      root,
      w.title || !several ? h("div", { class: "w-label" }, w.title || lists[0]?.name || "Tasks") : null,
      empty
        ? h("div", { class: "w-empty" }, "All done 🎉")
        : h(
            "div",
            { class: "tk-lists" },
            ...lists
              .filter((l) => l.tasks.length > 0)
              .map((l) =>
                h(
                  "section",
                  {},
                  several ? h("div", { class: "tk-list" }, l.name) : null,
                  h("ul", { class: "tk-items" }, ...l.tasks.map((t) => row(l.id, t, today))),
                ),
              ),
          ),
      message ? h("div", { class: "tk-msg" }, message) : null,
    );
  }

  const stopFeed = subscribe<TasksData>("tasks", TASKS_EVERY, (d) => {
    data = d;
    // Forget ticks the feed has caught up with.
    const ids = new Set(providerLists(d, w.provider).lists.flatMap((l) => l.tasks.map((t) => t.id)));
    for (const id of done) if (!ids.has(id)) done.delete(id);
    draw(new Date(), true);
  });
  // Moves "Tomorrow" to "Today" at midnight.
  const stopTick = everyMinute((now) => draw(now));
  return () => {
    stopFeed();
    stopTick();
    // A tick still in its undo window would otherwise vanish with the widget (a view change) and never reach Google.
    for (const [taskId, { listId, timer }] of pending) {
      window.clearTimeout(timer);
      void send("tasks", { provider: w.provider, list: listId, task: taskId });
    }
    pending.clear();
    window.clearTimeout(messageTimer);
  };
};
