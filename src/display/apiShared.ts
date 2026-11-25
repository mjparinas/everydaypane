import type * as Api from "./api";

// What a widget built as its own file (src/display/widgets/lazy.ts) uses in place of ../api. The feeds, the device
// token and the offline state live in display.js's copy of api.ts, so a separate bundle must not start a second one:
// scripts/build-display.mjs points ../api here for those builds, and these pass each call to the copy display.js
// shares on globalThis.

const api = () => (globalThis as { __epApi?: typeof Api }).__epApi!;

export const subscribe: typeof Api.subscribe = (...a) => api().subscribe(...a);
export const refresh: typeof Api.refresh = (...a) => api().refresh(...a);
export const send: typeof Api.send = (...a) => api().send(...a);
export const sendExplained: typeof Api.sendExplained = (...a) => api().sendExplained(...a);
export const imageUrl: typeof Api.imageUrl = (...a) => api().imageUrl(...a);
