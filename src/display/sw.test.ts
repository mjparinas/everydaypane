import { afterEach, expect, it, vi } from "vitest";

type FetchEvent = { request: Request; respondWith(response: Promise<Response>): void };

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.resetModules();
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

it("keeps a bounded cache of loaded photos and serves cached ones immediately", async () => {
  vi.useFakeTimers();
  const origin = "https://everydaypane.example";
  const handlers = new Map<string, (event: FetchEvent) => void>();
  const store = new Map<string, Response>();
  vi.stubGlobal("self", {
    location: new URL(`${origin}/display/sw.js`),
    addEventListener: (type: string, handler: (event: FetchEvent) => void) => handlers.set(type, handler),
  });
  vi.stubGlobal("caches", {
    open: async (name: string) =>
      name === "ep-photos"
        ? {
            match: async (req: Request) => store.get(req.url)?.clone(),
            put: async (req: Request, res: Response) => {
              store.set(req.url, res);
            },
            keys: async () => [...store.keys()].map((u) => new Request(u)),
            delete: async (req: Request) => store.delete(req.url),
          }
        : { match: async () => undefined, put: async () => undefined },
  });
  let netCalls = 0;
  vi.stubGlobal("fetch", async (req: Request) => {
    netCalls++;
    const id = new URL(req.url).searchParams.get("i") ?? "";
    if (id === "slow") await new Promise((resolve) => setTimeout(resolve, 15_000));
    if (id === "missing") return new Response("not found", { status: 404 });
    return new Response(`bytes-${id}`, { status: 200, headers: { "content-type": "image/jpeg" } });
  });

  await import("./sw");
  const onFetch = handlers.get("fetch")!;
  const fetchPhoto = (id: string) =>
    new Promise<Response>((resolve) =>
      onFetch({ request: new Request(`${origin}/api/display/photo/?s=amz&i=${id}&w=1920`), respondWith: resolve }),
    );

  // A cold Amazon re-list taking 15s isn't cut off by the 10s JSON timeout.
  const slow = fetchPhoto("slow");
  await vi.advanceTimersByTimeAsync(15_000);
  expect(await (await slow).text()).toBe("bytes-slow");

  // Errors aren't cached, and capping at 12 drops the oldest pictures so storage stays bounded.
  expect((await fetchPhoto("missing")).status).toBe(404);
  for (let i = 0; i < 13; i++) expect((await fetchPhoto(`p${i}`)).status).toBe(200);
  await vi.advanceTimersByTimeAsync(0);
  expect(store.size).toBe(12);
  expect(store.has(`${origin}/api/display/photo/?s=amz&i=slow&w=1920`)).toBe(false);

  // Cached fallback hits don't touch the network at all.
  const before = netCalls;
  expect(await (await fetchPhoto("p12")).text()).toBe("bytes-p12");
  expect(netCalls).toBe(before);
});
