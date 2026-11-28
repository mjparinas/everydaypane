import { describe, expect, it } from "vitest";

import { nameCase, titleCase } from "./titleCase";

describe("titleCase", () => {
  it.each([
    ["soccer practice", "Soccer Practice"],
    ["dinner at the smiths", "Dinner at the Smiths"],
    ["Dinner At The Smiths", "Dinner at the Smiths"],
    ["the end of the line", "The End of the Line"],
    ["what are you up to", "What Are You Up To"],
    ["pick up kids", "Pick Up Kids"],
    ["sam's dentist appointment", "Sam's Dentist Appointment"],
    ["school drop-off", "School Drop-Off"],
    ["PRO-D day", "PRO-D Day"],
    ["Pro-D day", "Pro-D Day"],
    ["BC day long weekend", "BC Day Long Weekend"],
    ["NO SCHOOL", "NO SCHOOL"],
    ["iPhone repair at McDonald's", "iPhone Repair at McDonald's"],
    ["meeting: plan for the week", "Meeting: Plan for the Week"],
    ["swim - the deep end", "Swim - The Deep End"],
    ["call bob (the plumber)", "Call Bob (the Plumber)"],
    ["(tentative) dinner", "(Tentative) Dinner"],
    ["canucks vs. oilers", "Canucks vs. Oilers"],
    ["zoom with jo@example.com on zoom.us", "Zoom with jo@example.com on zoom.us"],
    ["2nd grade concert 7pm", "2nd Grade Concert 7pm"],
    ["école: réunion des parents", "École: Réunion Des Parents"],
    ["  spaced   out  ", "  Spaced   Out  "],
    ["", ""],
    ["🎂 mom's birthday", "🎂 Mom's Birthday"],
  ])("%j → %j", (input, expected) => {
    expect(titleCase(input)).toBe(expected);
  });
});

describe("nameCase", () => {
  it("capitalises every part of a lower-case name and leaves cased words alone", () => {
    expect(nameCase("melvin parinas")).toBe("Melvin Parinas");
    expect(nameCase("anne-marie o'brien")).toBe("Anne-Marie O'Brien");
    expect(nameCase("ana de la cruz")).toBe("Ana De La Cruz");
    expect(nameCase("Ronan McDonald jr.")).toBe("Ronan McDonald Jr.");
    expect(nameCase("ALEX")).toBe("ALEX");
  });
});
