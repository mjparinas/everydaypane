import "server-only";

import qrcode from "qrcode-generator";

// The Wi-Fi QR code is drawn on the server as SVG, so the display carries no QR library.

/** The Wi-Fi network string phones understand (the ZXing format), with its special characters escaped. */
export function wifiString(w: { ssid: string; password: string; encryption: "WPA" | "WEP" | "nopass"; hidden: boolean }): string {
  const esc = (s: string) => s.replace(/([\\;,:"])/g, "\\$1");
  const parts = [`T:${w.encryption}`, `S:${esc(w.ssid)}`];
  if (w.encryption !== "nopass") parts.push(`P:${esc(w.password)}`);
  if (w.hidden) parts.push("H:true");
  return `WIFI:${parts.join(";")};;`;
}

export function qrSvg(text: string): string {
  const qr = qrcode(0, "M");
  qr.addData(text, "Byte");
  qr.make();
  const n = qr.getModuleCount();
  let path = "";
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.isDark(y, x)) path += `M${x} ${y}h1v1h-1z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-2 -2 ${n + 4} ${n + 4}" shape-rendering="crispEdges"><rect x="-2" y="-2" width="${n + 4}" height="${n + 4}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
}
