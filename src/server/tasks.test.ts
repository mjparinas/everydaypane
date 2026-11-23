import { describe, expect, it } from "vitest";

import { defaultConfig } from "@/lib/config/defaults";

import { mayCompleteTasks } from "./tasks";

describe("tasks providers", () => {
  it("respects provider on the widget when allowing tick-off", () => {
    const config = defaultConfig();
    config.integrations.tasks.lists = [{ id: "g1", name: "Home", enabled: true }];
    config.views[0]!.widgets.push({
      id: "t1",
      type: "tasks",
      provider: "google",
      listIds: ["g1"],
      count: 5,
      showDue: true,
      allowCheck: true,
      x: 0,
      y: 0,
      w: 2,
      h: 2,
      showBackground: true,
    });
    expect(mayCompleteTasks(config, "google", "g1")).toBe(true);
    expect(mayCompleteTasks(config, "todoist", "g1")).toBe(false);
  });
});
