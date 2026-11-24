"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/** Cookieless first-party page views for the marketing site (Tuned beacon). Skips ops and signed-in panels. */
export function SiteBeacon() {
  const pathname = usePathname() || "/";

  useEffect(() => {
    if (
      pathname.startsWith("/admin") ||
      pathname.startsWith("/household") ||
      pathname.startsWith("/family") ||
      pathname.startsWith("/d/") ||
      pathname.startsWith("/display")
    ) {
      return;
    }
    if (
      typeof navigator !== "undefined" &&
      "globalPrivacyControl" in navigator &&
      (navigator as { globalPrivacyControl?: boolean }).globalPrivacyControl
    ) {
      return;
    }
    const ua = navigator.userAgent;
    const browser = /Edg\//.test(ua)
      ? "Edge"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : /Firefox\//.test(ua)
          ? "Firefox"
          : /Safari\//.test(ua)
            ? "Safari"
            : "Other";
    const os = /Mac/.test(ua)
      ? "macOS"
      : /Windows/.test(ua)
        ? "Windows"
        : /Android/.test(ua)
          ? "Android"
          : /iPhone|iPad/.test(ua)
            ? "iOS"
            : "Other";
    const device = /Mobi|Android/i.test(ua) ? "mobile" : "desktop";
    const params = new URLSearchParams(window.location.search);
    void fetch("/api/pv/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: pathname,
        referrer: document.referrer
          ? (() => {
              try {
                return new URL(document.referrer).host;
              } catch {
                return "";
              }
            })()
          : "",
        utm_source: params.get("utm_source") || undefined,
        utm_campaign: params.get("utm_campaign") || undefined,
        browser,
        os,
        device,
      }),
      keepalive: true,
    }).catch(() => undefined);
  }, [pathname]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      const t = (e.target as HTMLElement | null)?.closest?.("[data-track]") as HTMLElement | null;
      if (!t) return;
      const track = t.getAttribute("data-track");
      if (!track) return;
      void fetch("/api/pv/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: window.location.pathname, track }),
        keepalive: true,
      }).catch(() => undefined);
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  return null;
}
