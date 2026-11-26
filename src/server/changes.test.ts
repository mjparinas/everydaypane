import { describe, expect, it } from "vitest";

import { useTestServer } from "@/test/server";

import { changedFeeds, markChanged, parseSeen, versions } from "./changes";

describe("family list counters", () => {
  useTestServer();

  it("counts each household's lists on their own", async () => {
    await markChanged("acct_a", "messages");
    await markChanged("acct_a", "messages");
    await markChanged("acct_b", "shopping");
    expect((await versions("acct_a")).feeds).toEqual({ messages: 2 });
    expect((await versions("acct_b")).feeds).toEqual({ shopping: 1 });
  });

  it("reads what the wall saw and what moved", () => {
    expect(parseSeen(null)).toBeNull();
    expect(parseSeen("")).toEqual({});
    expect(parseSeen("messages:3,shopping:5,bogus:1,meals:x")).toEqual({ messages: 3, shopping: 5 });
    expect(changedFeeds({ messages: 3, shopping: 5 }, { messages: 3, shopping: 6, chores: 1 })).toEqual(["shopping", "chores"]);
    expect(changedFeeds({ messages: 3 }, { messages: 3 })).toEqual([]);
  });
});
