import { afterEach, expect, it, vi } from "vitest";

type FetchEvent = { request: Request; respondWith(response: Promise<Response>): void };

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("lets a cold photo list finish while keeping the normal feed timeout", async () => {
  vi.useFakeTimers();
  const origin = "https://everydaypane.example";
  const handlers = new Map<string, (event: FetchEvent) => void>();
  const put = vi.fn(async () => undefined);
  vi.stubGlobal("self", {
    location: new URL(`${origin}/display/sw.js`),
    addEventListener: (type: string, handler: (event: FetchEvent) => void) => handlers.set(type, handler),
  });
  vi.stubGlobal("caches", { open: async () => ({ match: async () => undefined, put }) });
  vi.stubGlobal("fetch", async (req: Request) => {
    // 25 pages of 200 photos with a 500 ms pause before each page, even with an instant Amazon response.
    await new Promise((resolve) => setTimeout(resolve, 12_500));
    return Response.json({ path: new URL(req.url).pathname });
  });
  await import("./sw");
  const onFetch = handlers.get("fetch");
  if (!onFetch) throw new Error("Missing service worker fetch handler");
  const fetchThroughWorker = (path: string) =>
    new Promise<Response>((resolve) => onFetch({ request: new Request(origin + path), respondWith: resolve }));

  const photos = fetchThroughWorker("/api/display/photos/");
  const weather = fetchThroughWorker("/api/display/weather/");
  await vi.advanceTimersByTimeAsync(10_000);
  expect((await weather).headers.get("x-offline")).toBe("1");
  await vi.advanceTimersByTimeAsync(2_500);
  expect(await (await photos).json()).toEqual({ path: "/api/display/photos/" });
  expect(put).toHaveBeenCalledOnce();
});
