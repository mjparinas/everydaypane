import { describe, expect, it } from "vitest";

import { qrSvg, wifiString } from "./wifi";

describe("Wi-Fi QR code", () => {
  it("escapes the characters the format reserves", () => {
    const net = { ssid: "Our;Home", password: String.raw`p:a,s"s\x`, encryption: "WPA" as const, hidden: false };
    expect(wifiString(net)).toBe(String.raw`WIFI:T:WPA;S:Our\;Home;P:p\:a\,s\"s\\x;;`);
  });

  it("leaves the password out of an open network and marks hidden ones", () => {
    expect(wifiString({ ssid: "Guest", password: "x", encryption: "nopass", hidden: true })).toBe("WIFI:T:nopass;S:Guest;H:true;;");
  });

  it("draws an SVG", () => {
    const svg = qrSvg("WIFI:T:WPA;S:Home;P:secret;;");
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("<path");
  });
});
