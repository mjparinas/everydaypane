import { describe, expect, it } from "vitest";

import { defaultConfig, freeDefaultConfig } from "@/lib/config/defaults";
import { FREE_LIMITS } from "@/lib/plans";
import { useTestServer } from "@/test/server";

import { createAccount, LEGACY_ACCOUNT_ID } from "./accounts";
import { addDevice } from "./devices";
import { gateConfig, gateNewDisplay, planForAccount } from "./planGates";

describe("gateConfig", () => {
  it("allows the Free starter document", () => {
    expect(gateConfig("free", freeDefaultConfig())).toEqual({ ok: true });
  });

  it("allows the full kitchen layout on Paid", () => {
    expect(gateConfig("paid", defaultConfig())).toEqual({ ok: true });
  });

  it("rejects extra views and Household widgets on Free", () => {
    const manyViews = freeDefaultConfig();
    manyViews.views.push({ ...structuredClone(manyViews.views[0]!), id: "extra", name: "Extra" });
    const blocked = gateConfig("free", manyViews);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.error).toMatch(/view/i);

    const paidWidget = freeDefaultConfig();
    paidWidget.views[0]!.widgets.push({
      id: "g",
      type: "garbage",
      x: 0,
      y: 0,
      w: 2,
      h: 2,
      showBackground: true,
      weeks: 2,
    });
    expect(gateConfig("free", paidWidget)).toMatchObject({ ok: false, error: expect.stringMatching(/garbage/i) });
  });

  it("rejects a fast photo interval on Free", () => {
    const c = freeDefaultConfig();
    const photos = c.views[0]!.widgets.find((w) => w.type === "photos");
    expect(photos?.type).toBe("photos");
    if (photos?.type === "photos") photos.intervalSeconds = FREE_LIMITS.minPhotoIntervalSeconds - 1;
    expect(gateConfig("free", c)).toMatchObject({ ok: false, error: expect.stringMatching(/photo/i) });
  });

  it("rejects schedule, screen saver, alert email and iCal links on Free", () => {
    const schedule = freeDefaultConfig();
    schedule.schedule.enabled = true;
    expect(gateConfig("free", schedule)).toMatchObject({ ok: false, error: expect.stringMatching(/schedule/i) });

    const saver = freeDefaultConfig();
    saver.screenSaver.idle = true;
    expect(gateConfig("free", saver)).toMatchObject({ ok: false, error: expect.stringMatching(/screen saver/i) });

    const mail = freeDefaultConfig();
    mail.alerts.notifyEmail = true;
    expect(gateConfig("free", mail)).toMatchObject({ ok: false, error: expect.stringMatching(/email/i) });

    const ical = freeDefaultConfig();
    ical.integrations.icals.push({ id: "school1", name: "School", color: "#5b8def", enabled: true });
    expect(gateConfig("free", ical)).toMatchObject({ ok: false, error: expect.stringMatching(/iCal/i) });
  });

  it("counts enabled calendars across Google, Microsoft and iCal", () => {
    const c = freeDefaultConfig();
    c.integrations.google.calendars = [
      { id: "a", name: "A", color: "#111111", enabled: true },
      { id: "b", name: "B", color: "#222222", enabled: true },
      { id: "c", name: "C", color: "#333333", enabled: true },
    ];
    expect(gateConfig("free", c)).toMatchObject({ ok: false, error: expect.stringMatching(/calendars/i) });

    const paid = defaultConfig();
    paid.integrations.google.calendars = Array.from({ length: 51 }, (_, i) => ({
      id: `c${i}`,
      name: `C${i}`,
      color: "#111111",
      enabled: true,
    }));
    expect(gateConfig("paid", paid)).toMatchObject({ ok: false, error: expect.stringMatching(/calendars/i) });
  });
});

describe("gateNewDisplay", () => {
  useTestServer();

  it("caps Free at two displays and Paid at twenty", async () => {
    const free = await createAccount("Free home", "free-displays@example.com", undefined, { trial: false });
    expect(await planForAccount(free.id)).toBe("free");
    expect(await gateNewDisplay(free.id)).toEqual({ ok: true });
    await addDevice(free.id, "Kitchen", null);
    await addDevice(free.id, "Office", null);
    expect(await gateNewDisplay(free.id)).toMatchObject({ ok: false, error: expect.stringMatching(/2 displays/i) });

    expect(await planForAccount(LEGACY_ACCOUNT_ID)).toBe("paid");
    expect(await gateNewDisplay(LEGACY_ACCOUNT_ID)).toEqual({ ok: true });
  });
});
