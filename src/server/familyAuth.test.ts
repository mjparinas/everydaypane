import { describe, expect, it } from "vitest";

import { GET as mealsGET, PUT as mealsPUT } from "@/app/api/meals/route";
import { GET as messagesGET, POST as messagesPOST } from "@/app/api/messages/route";
import { GET as shoppingGET, POST as shoppingPOST } from "@/app/api/shopping/route";
import { editPagePath, editPageUrl } from "@/lib/editPage";
import { cookieFor, req, useTestServer } from "@/test/server";

import { addDevice } from "./devices";
import { familyEditorFor, familyEditorIsAdmin, familyEditorKey } from "./familyAuth";
import { mealsBetween } from "./meals";
import { listMessages } from "./messages";
import { listShopping } from "./shopping";

describe("edit page helpers", () => {
  it("builds the phone edit path from a display token", () => {
    expect(editPagePath("Ab12Cd34")).toBe("/d/Ab12Cd34/edit/");
    expect(editPageUrl("https://pane.example", "Ab12Cd34")).toBe("https://pane.example/d/Ab12Cd34/edit/");
  });
});

describe("familyEditorFor", () => {
  useTestServer();

  it("accepts a family session or a display token, not a bare request", async () => {
    expect(await familyEditorFor(req("/api/meals/"))).toBeNull();
    const family = await cookieFor("kid@example.com");
    const fromSession = await familyEditorFor(req("/api/meals/", { headers: { cookie: family } }));
    expect(fromSession?.kind).toBe("session");
    if (fromSession?.kind !== "session") return;
    expect(familyEditorKey(fromSession)).toBe("kid@example.com");
    expect(familyEditorIsAdmin(fromSession)).toBe(false);

    const { device, token } = await addDevice("Kitchen", null);
    const fromDisplay = await familyEditorFor(req("/api/meals/", { headers: { "x-display-token": token } }));
    expect(fromDisplay?.kind).toBe("display");
    if (fromDisplay?.kind !== "display") return;
    expect(fromDisplay.device.id).toBe(device.id);
    expect(familyEditorKey(fromDisplay)).toBe(`display:${device.id}`);
    expect(familyEditorIsAdmin(fromDisplay)).toBe(false);
  });

  it("lets a display token read and write meals, shopping and messages", async () => {
    const { device, token } = await addDevice("Kitchen", null);
    const headers = { "x-display-token": token, origin: "http://localhost" };

    expect((await mealsGET(req("/api/meals/?days=7", { headers }))).status).toBe(200);
    const mealWrite = await mealsPUT(
      req("/api/meals/", {
        method: "PUT",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ date: "2026-11-23", slot: "dinner", text: "Tacos" }),
      }),
    );
    expect(mealWrite.status).toBe(200);
    const plan = await mealsBetween("2026-11-23", 1);
    expect(plan["2026-11-23"]?.dinner).toBe("Tacos");

    expect((await shoppingGET(req("/api/shopping/", { headers }))).status).toBe(200);
    const shopWrite = await shoppingPOST(
      req("/api/shopping/", {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ text: "Milk" }),
      }),
    );
    expect(shopWrite.status).toBe(201);
    expect((await listShopping()).items.map((i) => i.text)).toContain("Milk");

    expect((await messagesGET(req("/api/messages/", { headers }))).status).toBe(200);
    const msgWrite = await messagesPOST(
      req("/api/messages/", {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ author: "Dad", text: "Back by 6", colour: "yellow", expiresInHours: 24 }),
      }),
    );
    expect(msgWrite.status).toBe(201);
    const board = await listMessages();
    expect(board[0]?.text).toBe("Back by 6");
    expect(board[0]?.postedBy).toBe(`display:${device.id}`);
    const listed = (await msgWrite.json()) as { message: { canDelete: boolean }; admin?: boolean };
    // Response shape from POST is { message }; admin flag is on GET.
    expect(listed.message.canDelete).toBe(true);
    const getBody = (await (await messagesGET(req("/api/messages/", { headers }))).json()) as { admin: boolean };
    expect(getBody.admin).toBe(false);
  });

  it("still refuses an invalid display token", async () => {
    expect((await mealsGET(req("/api/meals/", { headers: { "x-display-token": "nope" } }))).status).toBe(401);
  });
});
