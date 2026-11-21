// Kitchen timers and the pomodoro (Melvin, 2026-11-21: "a regular timer, and a separate pomodoro", with visual and
// sound alerts). The arithmetic lives here, free of the DOM, so it is tested on its own; the display widgets
// (src/display/widgets/timer.ts and pomodoro.ts) draw it and ring through src/display/alarm.ts.

/** "0:45", "12:05", "1:02:03". Rounds up, so a timer reads 0:00 only when it is done. */
export function clockText(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** A preset's button text when it has no name: "30 sec", "5 min", "1 h 30 min". */
export function durationText(seconds: number): string {
  if (seconds < 60) return `${seconds} sec`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const parts = [h ? `${h} h` : "", m ? `${m} min` : "", s ? `${s} sec` : ""].filter(Boolean);
  return parts.join(" ");
}

// ---- Kitchen timers ----

/** A running (endsAt set) or paused (leftMs kept) kitchen timer. */
export interface KitchenTimer {
  id: string;
  label: string;
  totalMs: number;
  endsAt: number | null;
  leftMs: number;
}

export function timeLeft(t: KitchenTimer, now: number): number {
  return t.endsAt === null ? t.leftMs : Math.max(0, t.endsAt - now);
}

export function isDone(t: KitchenTimer, now: number): boolean {
  return t.endsAt !== null && t.endsAt <= now;
}

export function pauseTimer(t: KitchenTimer, now: number): KitchenTimer {
  return t.endsAt === null ? t : { ...t, endsAt: null, leftMs: timeLeft(t, now) };
}

export function resumeTimer(t: KitchenTimer, now: number): KitchenTimer {
  return t.endsAt === null ? { ...t, endsAt: now + t.leftMs } : t;
}

/** "+1 min" on a running, paused or finished timer. A finished one starts again from a minute. */
export function addTime(t: KitchenTimer, ms: number, now: number): KitchenTimer {
  if (t.endsAt === null) return { ...t, leftMs: t.leftMs + ms, totalMs: t.totalMs + ms };
  const from = Math.max(t.endsAt, now);
  return { ...t, endsAt: from + ms, totalMs: t.totalMs + ms };
}

// ---- Pomodoro ----

export type PomodoroPhase = "work" | "short" | "long";

export interface PomodoroSettings {
  workMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  /** Focus rounds before the long break. */
  rounds: number;
  /** Start the next phase by itself when one ends. */
  autoStart: boolean;
}

/** Where a pomodoro is: the phase, which focus round (from 1), and its end (running) or what was left (paused). */
export interface PomodoroState {
  phase: PomodoroPhase;
  round: number;
  endsAt: number | null;
  leftMs: number;
}

export const PHASE_LABELS: Record<PomodoroPhase, string> = { work: "Focus", short: "Short break", long: "Long break" };

export function phaseMs(phase: PomodoroPhase, s: PomodoroSettings): number {
  const minutes = phase === "work" ? s.workMinutes : phase === "short" ? s.shortBreakMinutes : s.longBreakMinutes;
  return minutes * 60_000;
}

export function freshPomodoro(s: PomodoroSettings): PomodoroState {
  return { phase: "work", round: 1, endsAt: null, leftMs: phaseMs("work", s) };
}

/** The phase after this one: focus, then a short break, and a long break after the last round. */
export function nextPhase(state: PomodoroState, s: PomodoroSettings): { phase: PomodoroPhase; round: number } {
  if (state.phase === "work") return { phase: state.round >= s.rounds ? "long" : "short", round: state.round };
  return { phase: "work", round: state.phase === "long" ? 1 : state.round + 1 };
}

/**
 * Moves to the next phase, starting it at `from` when `run` is set, or leaving it paused at its full length. Skip
 * uses it with the current time; a phase that ran out uses it with the time it ended.
 */
export function advance(state: PomodoroState, s: PomodoroSettings, run: boolean, from: number): PomodoroState {
  const next = nextPhase(state, s);
  const ms = phaseMs(next.phase, s);
  return { ...next, endsAt: run ? from + ms : null, leftMs: ms };
}

/**
 * Catches up with phases that ended while nobody was looking (the page was hidden, or a different view was showing).
 * Returns the state now and the phase that ended last, if one did, with when it ended.
 */
export function settle(
  state: PomodoroState,
  s: PomodoroSettings,
  now: number,
): { state: PomodoroState; ended: { phase: PomodoroPhase; at: number } | null } {
  let ended: { phase: PomodoroPhase; at: number } | null = null;
  // A day of phases at most, so a pomodoro left running for a week can't loop for long.
  for (let i = 0; i < 200 && state.endsAt !== null && state.endsAt <= now; i++) {
    ended = { phase: state.phase, at: state.endsAt };
    state = advance(state, s, s.autoStart, state.endsAt);
  }
  return { state, ended };
}

/** What a phase ending says on the screen. */
export function endedText(phase: PomodoroPhase, next: PomodoroPhase): string {
  if (phase === "work") return next === "long" ? "Time for a long break" : "Time for a break";
  return "Back to focus";
}
