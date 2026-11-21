import { describe, expect, it } from "vitest";

import {
  addTime,
  advance,
  clockText,
  durationText,
  endedText,
  freshPomodoro,
  nextPhase,
  pauseTimer,
  resumeTimer,
  settle,
  timeLeft,
  type KitchenTimer,
  type PomodoroSettings,
} from "./timers";

const s: PomodoroSettings = { workMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15, rounds: 4, autoStart: false };
const MIN = 60_000;

describe("timer text", () => {
  it("counts down in minutes and seconds, rounding up", () => {
    expect(clockText(0)).toBe("0:00");
    expect(clockText(1)).toBe("0:01");
    expect(clockText(59_001)).toBe("1:00");
    expect(clockText(725_000)).toBe("12:05");
    expect(clockText(3_723_000)).toBe("1:02:03");
    expect(clockText(-5)).toBe("0:00");
  });

  it("names a preset by its length", () => {
    expect(durationText(30)).toBe("30 sec");
    expect(durationText(300)).toBe("5 min");
    expect(durationText(90)).toBe("1 min 30 sec");
    expect(durationText(5400)).toBe("1 h 30 min");
  });
});

describe("kitchen timers", () => {
  const t: KitchenTimer = { id: "a", label: "Pasta", totalMs: 10 * MIN, endsAt: 1_000_000 + 10 * MIN, leftMs: 0 };

  it("pauses and resumes where it left off", () => {
    const paused = pauseTimer(t, 1_000_000 + 4 * MIN);
    expect(paused.endsAt).toBeNull();
    expect(timeLeft(paused, 9_999_999)).toBe(6 * MIN);
    const resumed = resumeTimer(paused, 2_000_000);
    expect(resumed.endsAt).toBe(2_000_000 + 6 * MIN);
  });

  it("adds a minute to a running or paused timer", () => {
    expect(addTime(t, MIN, 1_000_000).endsAt).toBe(1_000_000 + 11 * MIN);
    expect(addTime(pauseTimer(t, 1_000_000), MIN, 0).leftMs).toBe(11 * MIN);
  });
});

describe("pomodoro", () => {
  it("goes focus, short break, focus … and a long break after the last round", () => {
    let st = freshPomodoro(s);
    const seen: string[] = [];
    for (let i = 0; i < 9; i++) {
      seen.push(`${st.phase}${st.round}`);
      st = advance(st, s, false, 0);
    }
    expect(seen).toEqual(["work1", "short1", "work2", "short2", "work3", "short3", "work4", "long4", "work1"]);
  });

  it("starts the next phase from when the last one ended, or waits for a tap", () => {
    const running = { phase: "work" as const, round: 1, endsAt: 1000, leftMs: 25 * MIN };
    expect(advance(running, s, true, 1000)).toEqual({ phase: "short", round: 1, endsAt: 1000 + 5 * MIN, leftMs: 5 * MIN });
    expect(advance(running, s, false, 1000).endsAt).toBeNull();
  });

  it("catches up with phases that ended while another view was showing", () => {
    const auto = { ...s, autoStart: true };
    const start = { phase: "work" as const, round: 1, endsAt: 25 * MIN, leftMs: 25 * MIN };
    // 25 + 5 + 25 minutes later: the second focus round has just ended and its break is running.
    const r = settle(start, auto, 56 * MIN);
    expect(r.state).toMatchObject({ phase: "short", round: 2, endsAt: 60 * MIN });
    expect(r.ended).toEqual({ phase: "work", at: 55 * MIN });
    // Without auto-start it stops after the first phase that ended.
    expect(settle(start, s, 56 * MIN).state).toMatchObject({ phase: "short", round: 1, endsAt: null });
    expect(settle(start, s, 1).ended).toBeNull();
  });

  it("says what comes next", () => {
    expect(nextPhase({ phase: "work", round: 4, endsAt: null, leftMs: 0 }, s).phase).toBe("long");
    expect(endedText("work", "short")).toBe("Time for a break");
    expect(endedText("work", "long")).toBe("Time for a long break");
    expect(endedText("short", "work")).toBe("Back to focus");
  });
});
