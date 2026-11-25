import * as api from "../api";
import type { Cleanup, Mount, WidgetContext } from "./types";

// Widgets that load on their own (2026-11-25): the wall script had passed its 40 KB budget (AGENTS.md "Display: super
// lightweight"), so a widget few screens use is built as its own file (scripts/build-display.mjs) and fetched only by a
// screen that shows it. It sits next to display.js and carries the same ?v= version, so a new deploy never mixes the
// two. The service worker keeps it for offline like the rest of /display/. Those files share this script's feeds
// through src/display/apiShared.ts.

type Lazy = {
  ecoflow: Mount<"ecoflow">;
  internet: Mount<"internet">;
  unifi: Mount<"unifi">;
  whiteboard: Mount<"whiteboard">;
  wildfires: Mount<"wildfires">;
  windy: Mount<"windy">;
};

(globalThis as { __epApi?: typeof api }).__epApi = api;

export function lazyWidget<K extends keyof Lazy>(name: K, el: HTMLElement, w: Parameters<Lazy[K]>[1], ctx: WidgetContext): Cleanup {
  let stop: Cleanup | undefined;
  let gone = false;
  // A URL built at run time, so esbuild leaves the import for the browser instead of bundling the widget back in.
  // Failing to load leaves the cell empty, like a widget type this script doesn't know.
  import(new URL(name + ".js" + new URL(import.meta.url).search, import.meta.url).href).then(
    (m: Lazy) => void (gone || (stop = (m[name] as Mount<typeof w.type>)(el, w as never, ctx))),
    () => undefined,
  );
  return () => {
    gone = true;
    stop?.();
  };
}
