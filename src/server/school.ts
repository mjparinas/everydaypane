import "server-only";

import type { DashboardConfig } from "@/lib/config/schema";
import type { SchoolData, SchoolState } from "@/lib/display/types";

import { cached } from "./cache";
import { fetchPublicHttps, publicHttpsUrl } from "./publicUrl";

// School status (Melvin, 2026-11-22): the district's own page, read for a closure, delay or late start. Langley
// (sd35.bc.ca) posts that in its notification banner. With nothing of the sort, schools are open. One copy is cached
// five minutes and shared by every display. A widget can then ignore a notice that isn't about its schools
// (src/lib/school.ts).

const TTL = 5 * 60_000;

export interface ParsedSchool {
  state: Exclude<SchoolState, "unknown">;
  summary: string;
  detail: string;
}

/** A public https page, or null. Never this machine or a private network (the address is an admin setting). */
export const publicPageUrl = publicHttpsUrl;

const SCHOOL_CLOSED =
  /\b(?:(?:all |the )?schools?|classes|the district)\b[^.]{0,80}\bclosed\b|\bschools? (?:are |is |will be |remain )?closed\b|\bclosed today\b/i;
const LATE = /\blate start\b|\bdelayed (?:opening|start)\b|\b(?:2|two)[\s-]hour (?:delay|late)\b|\bschools? (?:are |will be )?delayed\b/i;

function present(text: string): string {
  return text.replace(/\b(?:not|no longer|n't) closed\b/gi, " ").replace(/\b(?:was|were|been) (?:closed|delayed)\b/gi, " ");
}

function sentence(text: string, re: RegExp): string {
  const parts = text.split(/(?<=[.!?])\s+/);
  const hit = parts.find((part) => re.test(part)) ?? text;
  const clean = hit.replace(/\s+/g, " ").trim();
  return clean.length > 220 ? `${clean.slice(0, 219).trimEnd()}…` : clean;
}

function classify(text: string, banner: boolean): ParsedSchool {
  const plain = text.replace(/\s+/g, " ").trim();
  if (!plain) return { state: "open", summary: "Open", detail: "" };
  const source = present(plain);
  const closed = banner ? /\bclosed\b/i.test(source) : SCHOOL_CLOSED.test(source);
  const delayed = banner ? /\blate start\b|\bdelay(?:ed)?\b/i.test(source) : LATE.test(source);
  if (closed) {
    return {
      state: "closed",
      summary: /\ball schools\b/i.test(plain) ? "All schools closed" : "Closed",
      detail: sentence(plain, /closed/i),
    };
  }
  if (delayed) {
    return {
      state: "delayed",
      summary: /late start/i.test(plain) ? "Late start" : "Delayed",
      detail: sentence(plain, /late start|delay/i),
    };
  }
  return { state: "open", summary: "Open", detail: "" };
}

function toText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, n: string) => {
      const code = Number(n);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : " ";
    })
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function withoutCode(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");
}

/** The inner HTML of the element that starts at `openAt`, nested tags of the same name included, capped so a broken page can't run away. */
function sliceElement(html: string, tag: string, openAt: number): string {
  const lower = html.toLowerCase();
  const openToken = `<${tag}`;
  const closeToken = `</${tag}>`;
  let depth = 0;
  let i = openAt;
  const end = Math.min(html.length, openAt + 12_000);
  while (i < end) {
    const nextOpen = lower.indexOf(openToken, i);
    const nextClose = lower.indexOf(closeToken, i);
    if (nextClose === -1 || nextClose >= end) return html.slice(openAt, end);
    const openIsTag = nextOpen !== -1 && nextOpen < nextClose && /[\s>/]/.test(html[nextOpen + openToken.length] ?? " ");
    if (openIsTag) {
      depth++;
      i = nextOpen + openToken.length;
    } else {
      depth--;
      i = nextClose + closeToken.length;
      if (depth === 0) return html.slice(openAt, i);
    }
  }
  return html.slice(openAt, i);
}

/** Text of alert, banner and notification blocks. Langley's notice uses `wp_ntf-notification` and `alert-primary`. */
function alertTexts(html: string): string[] {
  const texts: string[] = [];
  const open = /<([a-z0-9]+)\b([^>]*)>/gi;
  let match: RegExpExecArray | null;
  while ((match = open.exec(html))) {
    const attrs = match[2] ?? "";
    if (!/(?:class|id|role)\s*=\s*["'][^"']*(?:notification|alert|banner|emergency|closure)[^"']*["']/i.test(attrs)) continue;
    const tag = (match[1] ?? "").toLowerCase();
    if (!tag) continue;
    const text = toText(sliceElement(html, tag, match.index));
    if (text) texts.push(text);
  }
  // A banner that only wraps a smaller one is dropped, so the notice isn't repeated.
  return texts.filter((text, i) => !texts.some((other, j) => j !== i && other.length < text.length && text.includes(other)));
}

function pageText(html: string): string {
  return toText(html.replace(/<nav[\s\S]*?<\/nav>/gi, " ").replace(/<footer[\s\S]*?<\/footer>/gi, " "));
}

/**
 * Closed, delayed or late start from a district page; otherwise open. A banner is read broadly ("CLOSED", "late
 * start"). The rest of the page only counts a present-tense notice about schools, so an old news story doesn't.
 */
export function parseSchoolPage(html: string): ParsedSchool {
  const clean = withoutCode(html);
  const alerts = alertTexts(clean).join(" ");
  if (alerts) {
    const fromBanner = classify(alerts, true);
    if (fromBanner.state !== "open") return fromBanner;
  }
  return classify(pageText(clean), false);
}

async function getHtml(url: string): Promise<string> {
  const r = await fetchPublicHttps(url, {
    headers: { "User-Agent": "Everydaypane/1.0", accept: "text/html, */*" },
    signal: AbortSignal.timeout(8_000),
  });
  if (!r.ok) throw new Error(`${new URL(url).host} answered ${r.status}`);
  if (!publicPageUrl(r.url || url)) throw new Error("The status page moved off a public https address.");
  const text = await r.text();
  if (text.length > 1_500_000) throw new Error("The status page is too big to read.");
  return text;
}

export async function schoolStatus(config: DashboardConfig, now = Date.now()): Promise<SchoolData> {
  const districtName = config.school.districtName.trim() || "School district";
  const url = publicPageUrl(config.school.statusUrl);
  if (!url) return { updatedAt: now, state: "unknown", summary: "No status page", detail: "", districtName };
  try {
    const hit = await cached(`school:${url}`, TTL, async () => parseSchoolPage(await getHtml(url)), now);
    return { ...hit.value, updatedAt: hit.fetchedAt, districtName };
  } catch {
    return { updatedAt: now, state: "unknown", summary: "Status unavailable", detail: "", districtName };
  }
}
