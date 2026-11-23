import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { defaultConfig } from "@/lib/config/defaults";
import type { SchoolData } from "@/lib/display/types";
import { schoolForWidget } from "@/lib/school";
import { useTestServer } from "@/test/server";

import { clearMemoryCache } from "./cache";
import { parseSchoolPage, publicPageUrl, schoolStatus } from "./school";

vi.mock("node:dns/promises", () => ({
  lookup: () => Promise.resolve([{ address: "1.1.1.1", family: 4 }]),
}));

const closedBanner = `
  <section class="wp_ntf-notification">
    <div class="alert-primary"><a>All schools are closed today because of snow.</a></div>
  </section>
  <article><p>Last winter schools were closed too.</p></article>
`;

const lateBanner = `<div class="alert">Late start: schools open two hours late.</div>`;

const oneSchool = `<p>Langley Secondary is closed today.</p>`;

const learningUpdate = `
  <section class="wp_ntf-notification"><div class="alert-primary">Upcoming learning updates for Friday.</div></section>
  <article><p>Last winter all schools were closed for snow.</p></article>
`;

describe("school page", () => {
  it("reads a closure banner as closed, and ignores a past story", () => {
    expect(parseSchoolPage(closedBanner)).toMatchObject({
      state: "closed",
      summary: "All schools closed",
      detail: "All schools are closed today because of snow.",
    });
  });

  it("reads a late start as delayed", () => {
    expect(parseSchoolPage(lateBanner)).toMatchObject({ state: "delayed", summary: "Late start" });
    expect(parseSchoolPage(`<div class="banner">Schools are delayed two hours.</div>`).state).toBe("delayed");
  });

  it("says open when the banner is an ordinary notice", () => {
    expect(parseSchoolPage(learningUpdate)).toMatchObject({ state: "open", summary: "Open", detail: "" });
    expect(parseSchoolPage("<p>Pay school fees. The office is closed on weekends.</p>").state).toBe("open");
  });

  it("still sees a closure that isn't inside the banner", () => {
    const html = `<div class="alert">Upcoming learning updates.</div><h1>All schools are closed today.</h1>`;
    expect(parseSchoolPage(html).state).toBe("closed");
  });

  it("keeps a notice that names a watched school, and drops one that doesn't", () => {
    const parsed = parseSchoolPage(oneSchool);
    const data: SchoolData = { ...parsed, updatedAt: 1, districtName: "Langley School District" };
    expect(schoolForWidget(data, ["Langley Secondary"]).state).toBe("closed");
    expect(schoolForWidget(data, ["Brookswood"]).state).toBe("open");
    expect(schoolForWidget(data, []).state).toBe("closed");
    const all = parseSchoolPage(closedBanner);
    expect(schoolForWidget({ ...all, updatedAt: 1, districtName: "Langley" }, ["Brookswood"]).summary).toBe("All schools closed");
  });

  it("only fetches a public https page", () => {
    expect(publicPageUrl("https://www.sd35.bc.ca/")).toBe("https://www.sd35.bc.ca/");
    expect(publicPageUrl("http://www.sd35.bc.ca/")).toBeNull();
    expect(publicPageUrl("https://192.168.1.20/status")).toBeNull();
    expect(publicPageUrl("https://localhost/status")).toBeNull();
    expect(publicPageUrl("not a url")).toBeNull();
  });
});

describe("school status feed", () => {
  useTestServer();
  beforeEach(() => clearMemoryCache());
  afterEach(() => vi.unstubAllGlobals());

  it("reads the closure once and serves the cached copy", async () => {
    const config = defaultConfig();
    config.school.statusUrl = "https://schools.example.com/";
    let calls = 0;
    vi.stubGlobal("fetch", () => {
      calls += 1;
      return Promise.resolve(new Response(closedBanner, { status: 200 }));
    });
    const first = await schoolStatus(config, 1_000);
    const second = await schoolStatus(config, 1_000 + 60_000);
    expect(first).toMatchObject({ state: "closed", summary: "All schools closed", districtName: "Langley School District" });
    expect(second.state).toBe("closed");
    expect(calls).toBe(1);
  });

  it("does not fetch a private address", async () => {
    const config = defaultConfig();
    config.school.statusUrl = "http://192.168.1.1/status";
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const data = await schoolStatus(config, 1);
    expect(data).toMatchObject({ state: "unknown", summary: "No status page" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("says the status is unavailable when the page can't be read", async () => {
    const config = defaultConfig();
    config.school.statusUrl = "https://schools.example.com/down";
    vi.stubGlobal("fetch", () => Promise.reject(new Error("down")));
    const data = await schoolStatus(config, 5);
    expect(data).toMatchObject({ state: "unknown", summary: "Status unavailable", districtName: "Langley School District" });
  });
});
