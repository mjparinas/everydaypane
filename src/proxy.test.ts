import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { NextRequest } from "next/server";
import { expect, it, vi } from "vitest";

import proxy, { config } from "./proxy";

it("matches live view previews and lets the route set its CSP", async () => {
  const url = "https://www.everydaypane.com/household/preview/home/?mode=day";
  expect(unstable_doesMiddlewareMatch({ config, url })).toBe(true);

  vi.stubEnv("CLERK_SECRET_KEY", "");
  try {
    const response = (await proxy(new NextRequest(url), undefined)) as Response;
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.has("content-security-policy")).toBe(false);
  } finally {
    vi.unstubAllEnvs();
  }
});
