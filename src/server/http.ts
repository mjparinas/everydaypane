import "server-only";

export const json = (body: unknown, status = 200, headers: HeadersInit = {}) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });

export const notFound = () => json({ error: "Not found" }, 404);
export const unauthorized = () => json({ error: "Sign in first" }, 401);
export const forbidden = () => json({ error: "Not allowed" }, 403);

/** Requests that change something must come from our own pages (no cross-site form posts). */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return req.headers.get("sec-fetch-site") === "same-origin";
  try {
    return new URL(origin).host === new URL(req.url).host;
  } catch {
    return false;
  }
}

/** The caller's address. Vercel sets x-forwarded-for itself, so its first entry can be trusted there. */
export const clientIp = (req: Request) => req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";

export async function readJson(req: Request, maxBytes = 512_000): Promise<unknown> {
  const text = await req.text();
  if (text.length > maxBytes) throw new Error("Too large");
  return JSON.parse(text) as unknown;
}
