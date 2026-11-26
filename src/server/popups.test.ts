import { describe, expect, it } from "vitest";

import { LEGACY_ACCOUNT_ID } from "@/server/accounts";
import { useTestServer } from "@/test/server";

import { dismissPopup, popupState, resetPopups } from "./popups";

const board = [{ createdAt: 200 }, { createdAt: 100 }];

describe("message pop-up state per screen", () => {
  useTestServer();

  it("starts a screen at the newest note and keeps that place on later reads", async () => {
    expect(await popupState(LEGACY_ACCOUNT_ID, "kitchen", board)).toEqual({ since: 200, dismissed: [] });
    expect(await popupState(LEGACY_ACCOUNT_ID, "kitchen", [{ createdAt: 500 }, ...board])).toEqual({ since: 200, dismissed: [] });
  });

  it("keeps a dismissal to the screen it was made on", async () => {
    await popupState(LEGACY_ACCOUNT_ID, "kitchen", board);
    await popupState(LEGACY_ACCOUNT_ID, "hall", board);
    await dismissPopup(LEGACY_ACCOUNT_ID, "kitchen", "m1");
    expect((await popupState(LEGACY_ACCOUNT_ID, "kitchen", board)).dismissed).toEqual(["m1"]);
    expect((await popupState(LEGACY_ACCOUNT_ID, "hall", board)).dismissed).toEqual([]);
  });

  it("forgets every screen's place when the mode is switched off", async () => {
    await popupState(LEGACY_ACCOUNT_ID, "kitchen", board);
    await dismissPopup(LEGACY_ACCOUNT_ID, "kitchen", "m1");
    await resetPopups(LEGACY_ACCOUNT_ID);
    expect(await popupState(LEGACY_ACCOUNT_ID, "kitchen", [{ createdAt: 900 }])).toEqual({ since: 900, dismissed: [] });
  });
});
