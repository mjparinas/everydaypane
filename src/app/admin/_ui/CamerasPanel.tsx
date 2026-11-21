"use client";

import { Section, Text } from "./fields";
import { useAdmin } from "./store";

// Live cameras (Melvin, 2026-11-21: "can I add RTSP or other video feeds"). Browsers can't play RTSP and our server
// can't reach the home network, so go2rtc runs at home and the screens play from it directly. All this panel keeps is
// its address; the cameras' RTSP links (which work as passwords) stay in go2rtc's own settings, never here.

function problem(url: string): string {
  if (!url) return "";
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return "It has to start with https:// (the dashboard is https, so screens refuse plain http video).";
    if (u.username || u.password || u.search || u.hash) return "Leave out any user name, password or ?query.";
    return "";
  } catch {
    return "That isn't a web address.";
  }
}

export function CamerasPanel() {
  const url = useAdmin((s) => s.config.integrations.cameras.go2rtcUrl);
  const edit = useAdmin((s) => s.edit);
  const issue = problem(url);
  return (
    <Section title="Live cameras">
      <p className="text-sm text-soft">
        For live video from UniFi Protect or any RTSP camera. Run go2rtc at home (a Home Assistant add-on or Docker) with your
        cameras&rsquo; RTSP links, give it an https address, and put that address here. Screens at home play straight from it; nothing goes
        through the internet. Then pick &ldquo;Live video&rdquo; on a camera widget. Setup steps are in{" "}
        <a
          className="underline"
          href="https://github.com/mjparinas/everydaypane/blob/main/docs/cameras.md"
          target="_blank"
          rel="noreferrer"
        >
          docs/cameras.md
        </a>
        .
      </p>
      <Text
        label="go2rtc address"
        type="url"
        value={url}
        maxLength={200}
        placeholder="https://cams.example.com:8443"
        hint={
          issue ||
          (url ? (
            <>
              To check it, open{" "}
              <a className="underline" href={url} target="_blank" rel="noreferrer">
                {url}
              </a>{" "}
              on a phone on your home WiFi: go2rtc&rsquo;s page should load with no warning.
            </>
          ) : undefined)
        }
        onChange={(v) => edit((c) => void (c.integrations.cameras.go2rtcUrl = v.trim()))}
      />
    </Section>
  );
}
