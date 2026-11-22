import { describe, expect, it, vi } from "vitest";

import { defaultConfig } from "@/lib/config/defaults";
import type { EmergencyAlert } from "@/lib/display/types";
import { useTestServer } from "@/test/server";

import { alreadyNotified, markNotified, notifyNewStripAlerts } from "./alertNotify";
import * as mail from "./mail";

const alert: EmergencyAlert = {
  id: "naad-test-1",
  source: "weather",
  severity: "severe",
  title: "Wind warning",
  area: "Langley",
  description: "Strong winds.",
  sent: 1_800_000_000_000,
  expires: null,
};

describe("alert email notify", () => {
  useTestServer();

  it("skips when notifyEmail is off", async () => {
    const send = vi.spyOn(mail, "sendEmail");
    const c = defaultConfig();
    await notifyNewStripAlerts(c, [alert]);
    expect(send).not.toHaveBeenCalled();
    send.mockRestore();
  });

  it("emails each strip-worthy alert once", async () => {
    const send = vi.spyOn(mail, "sendEmail").mockResolvedValue(true);
    const c = defaultConfig();
    c.alerts.notifyEmail = true;
    c.alerts.banner = "moderate";
    await notifyNewStripAlerts(c, [alert]);
    expect(send).toHaveBeenCalledTimes(2);
    expect(await alreadyNotified(alert.id)).toBe(true);
    await notifyNewStripAlerts(c, [alert]);
    expect(send).toHaveBeenCalledTimes(2);
    send.mockRestore();
  });

  it("ignores alerts below the banner threshold", async () => {
    const send = vi.spyOn(mail, "sendEmail").mockResolvedValue(true);
    const c = defaultConfig();
    c.alerts.notifyEmail = true;
    c.alerts.banner = "extreme";
    await notifyNewStripAlerts(c, [{ ...alert, severity: "minor" }]);
    expect(send).not.toHaveBeenCalled();
    send.mockRestore();
  });

  it("tracks notification ids", async () => {
    await markNotified("x", 100);
    expect(await alreadyNotified("x")).toBe(true);
    expect(await alreadyNotified("y")).toBe(false);
  });
});
