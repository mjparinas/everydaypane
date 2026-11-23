import { describe, expect, it } from "vitest";

import { alertEmail, EMAIL, emailHtml, escapeHtml, signInEmail } from "./email";
import { BRAND, SITE_URL } from "./site";

describe("email chrome", () => {
  it("escapes HTML entities", () => {
    expect(escapeHtml(`a&b<"c">`)).toBe("a&amp;b&lt;&quot;c&quot;&gt;");
  });

  it("wraps content in Everydaypane branding", () => {
    const html = emailHtml({
      preheader: "Preview line",
      title: "Hello",
      bodyHtml: "<p>Body</p>",
      cta: { href: "https://example.com/go", label: "Continue" },
      footnote: "Ignore if unexpected.",
    });
    expect(html).toContain("everyday");
    expect(html).toContain("pane");
    expect(html).toContain(EMAIL.brand);
    expect(html).toContain(`${SITE_URL}/icons/icon-64.png`);
    expect(html).toContain(BRAND.tagline);
    expect(html).toContain("Preview line");
    expect(html).toContain("Continue");
    expect(html).toContain('href="https://example.com/go"');
    expect(html).toContain("Ignore if unexpected.");
  });

  it("builds a branded sign-in message", () => {
    const link = "https://pane.getliftsmith.com/signin/verify/?token=abc&x=1";
    const mail = signInEmail(link);
    expect(mail.subject).toBe(`Your ${BRAND.name} sign-in link`);
    expect(mail.text).toContain(link);
    expect(mail.html).toContain("Sign in");
    expect(mail.html).toContain(escapeHtml(link));
    expect(mail.html).toContain(EMAIL.brand);
  });

  it("builds a branded alert message with a severity accent", () => {
    const mail = alertEmail({
      title: "Wind warning <test>",
      area: "Langley",
      description: "Strong winds.\nStay indoors.",
      severity: "severe",
    });
    expect(mail.subject).toBe(`${BRAND.name}: Wind warning <test>`);
    expect(mail.text).toContain("Strong winds.");
    expect(mail.html).toContain("Wind warning &lt;test&gt;");
    expect(mail.html).toContain("Langley");
    expect(mail.html).toContain("Strong winds.<br>Stay indoors.");
    expect(mail.html).toContain(EMAIL.bad);
    expect(mail.html).toContain(EMAIL.brand);
  });
});
