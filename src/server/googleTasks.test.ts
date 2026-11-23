import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LEGACY_ACCOUNT_ID } from "@/server/accounts";

import { GET as adminGET } from "@/app/api/admin/google-tasks/route";
import { GET as tasksGET, POST as tasksPOST } from "@/app/api/display/tasks/route";
import { newWidget } from "@/lib/config/widgets";
import type { TasksData } from "@/lib/display/types";
import { cookieFor, req, useTestServer } from "@/test/server";

import { clearMemoryCache } from "./cache";
import { loadConfig, saveConfig } from "./config";
import { addDevice } from "./devices";
import { consentUrl, resetGoogleForTests, SCOPE, TASKS_SCOPE } from "./google";
import { mayComplete, trimTasks } from "./googleTasks";
import { setSecret } from "./secrets";

describe("Google Tasks data", () => {
  it("asks Google for Tasks only when connecting Google Tasks", () => {
    expect(consentUrl("s", "https://x/cb")).not.toContain("auth%2Ftasks");
    expect(new URL(consentUrl("s", "https://x/cb", false, true)).searchParams.get("scope")).toBe(`${SCOPE} ${TASKS_SCOPE}`);
  });

  it("keeps open tasks in Google's order, each followed by its subtasks", () => {
    expect(
      trimTasks([
        { id: "milk", title: "Milk", position: "00000000000000000002" },
        { id: "bread", title: " Bread ", position: "00000000000000000001", due: "2026-11-18T00:00:00.000Z" },
        { id: "rye", title: "Rye", parent: "bread", position: "00000000000000000001" },
        { id: "done", title: "Eggs", status: "completed", position: "00000000000000000000" },
        { id: "blank", title: "  ", position: "00000000000000000003" },
        { id: "orphan", title: "Lost", parent: "done" },
        { nope: true },
      ]),
    ).toEqual([
      { id: "bread", title: "Bread", due: "2026-11-18" },
      { id: "rye", title: "Rye", sub: true },
      { id: "milk", title: "Milk" },
    ]);
  });
});

describe("Google Tasks on displays", () => {
  useTestServer({ GOOGLE_CLIENT_ID: "client-id", GOOGLE_CLIENT_SECRET: "client-secret" });

  const calls: { url: string; init: RequestInit | undefined }[] = [];

  beforeEach(() => {
    resetGoogleForTests();
    clearMemoryCache();
    calls.length = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        calls.push({ url, init });
        if (url.startsWith("https://oauth2.googleapis.com/token"))
          return Promise.resolve(Response.json({ access_token: "access-1", expires_in: 3600 }));
        if (url.includes("/users/@me/lists"))
          return Promise.resolve(
            Response.json({
              items: [
                { id: "groceries", title: "Groceries" },
                { id: "chores", title: "Chores" },
              ],
            }),
          );
        if (url.includes("/lists/groceries/tasks?"))
          return Promise.resolve(Response.json({ items: [{ id: "t1", title: "Milk", position: "1" }] }));
        if (url.includes("/lists/groceries/tasks/t1") && init?.method === "PATCH") return Promise.resolve(Response.json({ id: "t1" }));
        if (url.includes("/lists/groceries/tasks/t1")) return Promise.resolve(Response.json({ id: "t1", status: "needsAction" }));
        if (url.includes("/lists/groceries/tasks/secret")) return Promise.resolve(new Response("missing", { status: 404 }));
        return Promise.resolve(new Response("unexpected", { status: 500 }));
      }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  async function connected(scopes = `${SCOPE} ${TASKS_SCOPE}`, allowCheck = true): Promise<string> {
    await setSecret(LEGACY_ACCOUNT_ID, "google.refreshToken", "refresh-1");
    await setSecret(LEGACY_ACCOUNT_ID, "google.scopes", scopes);
    const stored = await loadConfig(LEGACY_ACCOUNT_ID);
    const config = structuredClone(stored.config);
    config.integrations.tasks.lists = [
      { id: "groceries", name: "Groceries", enabled: true },
      { id: "chores", name: "Chores", enabled: false },
    ];
    const view = config.views[0];
    if (!view) throw new Error("no view");
    view.widgets = [{ ...newWidget("tasks", "tk", { x: 0, y: 0 }), allowCheck }];
    expect((await saveConfig(LEGACY_ACCOUNT_ID, config, stored.version)).ok).toBe(true);
    return (await addDevice(LEGACY_ACCOUNT_ID, "Kitchen", null)).token;
  }

  const tick = (token: string, list: string, task = "t1") =>
    tasksPOST(req("/api/display/tasks/", { method: "POST", headers: { "x-display-token": token }, body: JSON.stringify({ list, task }) }));

  it("gives displays the switched-on lists' open tasks", async () => {
    const token = await connected();
    const data = (await (await tasksGET(req("/api/display/tasks/", { headers: { "x-display-token": token } }))).json()) as TasksData;
    expect(data).toMatchObject({ connected: true, lists: [{ id: "groceries", name: "Groceries", tasks: [{ id: "t1", title: "Milk" }] }] });
    expect(calls.some((c) => c.url.includes("/lists/chores/"))).toBe(false);
  });

  it("ticks a task off only in a list a widget that allows it shows", async () => {
    const token = await connected();
    expect((await tick(token, "groceries")).status).toBe(200);
    const got = calls.find((c) => c.url.endsWith("/tasks/t1") && (c.init?.method ?? "GET") === "GET");
    expect(got?.url).toBe("https://tasks.googleapis.com/tasks/v1/lists/groceries/tasks/t1");
    const patch = calls.find((c) => c.init?.method === "PATCH");
    expect(patch?.url).toBe("https://tasks.googleapis.com/tasks/v1/lists/groceries/tasks/t1");
    expect(JSON.parse(String(patch?.init?.body))).toEqual({ status: "completed" });
    expect((await tick(token, "groceries", "secret")).status).toBe(403);

    expect((await tick(token, "chores")).status).toBe(403);
    expect(
      (await tasksPOST(req("/api/display/tasks/", { method: "POST", body: JSON.stringify({ list: "groceries", task: "t1" }) }))).status,
    ).toBe(401);
  });

  it("refuses ticks when no widget allows them", async () => {
    await connected(undefined, false);
    expect(mayComplete((await loadConfig(LEGACY_ACCOUNT_ID)).config, "groceries")).toBe(false);
  });

  it("says Tasks isn't connected until the account allows it", async () => {
    const token = await connected(SCOPE);
    const data = (await (await tasksGET(req("/api/display/tasks/", { headers: { "x-display-token": token } }))).json()) as TasksData;
    expect(data).toMatchObject({ connected: false, lists: [] });
    const admin = await cookieFor("admin@example.com");
    expect(await (await adminGET(req("/api/admin/google-tasks/", { headers: { cookie: admin } }))).json()).toMatchObject({
      allowed: false,
    });
  });

  it("lists the account's task lists for admins only", async () => {
    await connected();
    const admin = await cookieFor("admin@example.com");
    expect(await (await adminGET(req("/api/admin/google-tasks/", { headers: { cookie: admin } }))).json()).toEqual({
      configured: true,
      allowed: true,
      lists: [
        { id: "groceries", name: "Groceries" },
        { id: "chores", name: "Chores" },
      ],
    });
    const kid = await cookieFor("kid@example.com");
    expect((await adminGET(req("/api/admin/google-tasks/", { headers: { cookie: kid } }))).status).toBe(401);
  });
});
