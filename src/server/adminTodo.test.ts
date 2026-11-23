import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createReport } from "./adminReports";
import { derivedTodo, hideTodo } from "./adminTodo";
import { resetForTests } from "./db";

describe("adminTodo", () => {
  beforeEach(() => {
    resetForTests();
    process.env.SESSION_SECRET = "x".repeat(32);
    process.env.ADMIN_EMAILS = "ops@example.com";
    process.env.RESEND_API_KEY = "re_test";
    process.env.NEXT_PUBLIC_SITE_URL = "https://www.everydaypane.com";
    process.env.ANALYTICS_SECRET = "salt";
    process.env.STRIPE_SECRET_KEY = "sk_test";
    process.env.STRIPE_PRICE_ID = "price_test";
    process.env.VERCEL_ENV = "development";
  });

  afterEach(() => {
    resetForTests();
  });

  it("lists open reports and can hide them", async () => {
    await createReport({ text: "Wall clock stuck", email: "ops@example.com" });
    const items = await derivedTodo();
    expect(items.some((i) => i.title.includes("problem report"))).toBe(true);
    const key = items.find((i) => i.title.includes("problem report"))!.key;
    await hideTodo(key, null, true);
    const after = await derivedTodo();
    expect(after.some((i) => i.key === key)).toBe(false);
  });
});
