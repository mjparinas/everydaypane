import { describe, expect, it } from "vitest";

import { isUnsubscribed, unsubscribeUrl } from "@/server/onboarding";
import { useTestServer } from "@/test/server";

import { GET, POST } from "./route";

describe("/api/email/unsubscribe/", () => {
  useTestServer({ NEXT_PUBLIC_SITE_URL: "http://localhost" });

  it("asks first on GET, so mail scanners can't unsubscribe anyone", async () => {
    const r = GET(new Request(unsubscribeUrl("new@example.com")));
    expect(r.status).toBe(200);
    expect(await r.text()).toContain('method="post"');
    expect(await isUnsubscribed("new@example.com")).toBe(false);
  });

  it("unsubscribes on POST (the button and RFC 8058 one-click), with no origin needed", async () => {
    const r = await POST(new Request(unsubscribeUrl("new@example.com"), { method: "POST", body: "List-Unsubscribe=One-Click" }));
    expect(r.status).toBe(200);
    expect(await isUnsubscribed("new@example.com")).toBe(true);
  });

  it("refuses a link that doesn't match", async () => {
    const r = await POST(new Request("http://localhost/api/email/unsubscribe/?e=new%40example.com&t=forged", { method: "POST" }));
    expect(r.status).toBe(400);
    expect(await isUnsubscribed("new@example.com")).toBe(false);
  });
});
