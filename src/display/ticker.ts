// One timer for the whole display, aligned to the wall-clock second, so every clock ticks together and nothing else
// wakes the CPU. Paused while the page is hidden.

type Listener = (now: Date) => void;
const second = new Set<Listener>();
const minute = new Set<Listener>();
let timer: number | undefined;
let lastMinute = -1;

function tick() {
  const now = new Date();
  for (const l of second) l(now);
  const m = Math.floor(now.getTime() / 60_000);
  if (m !== lastMinute) {
    lastMinute = m;
    for (const l of minute) l(now);
  }
  schedule();
}

function schedule() {
  window.clearTimeout(timer);
  if (document.hidden || (second.size === 0 && minute.size === 0)) return;
  // Wake just after the next second boundary (and only each minute when nothing needs seconds).
  const now = Date.now();
  const wait = second.size ? 1000 - (now % 1000) + 5 : 60_000 - (now % 60_000) + 5;
  timer = window.setTimeout(tick, wait);
}

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) tick();
  else window.clearTimeout(timer);
});

export function everySecond(l: Listener): () => void {
  second.add(l);
  l(new Date());
  schedule();
  return () => {
    second.delete(l);
    schedule();
  };
}

export function everyMinute(l: Listener): () => void {
  minute.add(l);
  l(new Date());
  schedule();
  return () => {
    minute.delete(l);
    schedule();
  };
}
