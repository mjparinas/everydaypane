"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { inNativeApp, nativePlugin, pushPlugin, safeAppPath, type LocationState } from "@/lib/nativeApp";

// The household and family pages' side of the Everydaypane app (Melvin, 2026-11-27). In a normal browser both of
// these render nothing and do nothing. In the app, the bridge registers this phone (for widgets, pushes and the home
// geofence), opens a tapped notification's page, sends a share from another app to the Share page, and tells the
// home-screen widgets to refresh when the person leaves the app (they've likely just changed a list).

interface PublicDevice {
  id: string;
  platform: "ios" | "android";
  name: string;
  push: boolean;
  notifyMessages: boolean;
  notifyAlerts: boolean;
  sharePresence: boolean;
}
interface Registered {
  device: PublicDevice;
  home: { latitude: number; longitude: number } | null;
}

/** Home's radius for "Share When I'm Home": a city lot plus GPS slack, and above iOS's useful minimum of ~100 m. */
const HOME_RADIUS_M = 150;

let registering: Promise<Registered | null> | null = null;

/** Registers (or refreshes) this phone with the server and hands the app token to the native side. */
export function registerThisPhone(pushToken?: string | null): Promise<Registered | null> {
  if (registering && pushToken === undefined) return registering;
  const run = async (): Promise<Registered | null> => {
    const native = nativePlugin();
    if (!native) return null;
    const [info, session] = await Promise.all([native.info(), native.getSession()]);
    const r = await fetch("/api/mobile/devices/", {
      method: "POST",
      headers: { "content-type": "application/json", ...(session.appToken ? { authorization: `Bearer ${session.appToken}` } : {}) },
      body: JSON.stringify({
        platform: info.platform,
        name: info.deviceName || "Phone",
        pushToken: pushToken ?? null,
        pushEnv: info.pushEnv,
      }),
    });
    if (!r.ok) return null;
    const body = (await r.json()) as Registered & { appToken: string | null };
    await native.setSession({ deviceId: body.device.id, appToken: body.appToken ?? session.appToken, baseUrl: window.location.origin });
    return { device: body.device, home: body.home };
  };
  registering = run().catch(() => null);
  return registering;
}

/** Signing out in the app: the phone stops getting pushes and its widgets go blank. */
export async function signOutThisPhone(): Promise<void> {
  const native = nativePlugin();
  if (!native) return;
  try {
    const { deviceId } = await native.getSession();
    await native.stopHomeGeofence().catch(() => undefined);
    if (deviceId) await fetch(`/api/mobile/devices/${encodeURIComponent(deviceId)}/`, { method: "DELETE" }).catch(() => undefined);
    await native.clearSession();
  } catch {
    // Signing out must never be blocked by the phone.
  }
}

/** Asks for notification permission (only after a tap) and registers the push token. */
async function turnOnPush(): Promise<boolean> {
  const push = pushPlugin();
  if (!push) return false;
  let { receive } = await push.checkPermissions();
  if (receive !== "granted") receive = (await push.requestPermissions()).receive;
  if (receive !== "granted") return false;
  await push.register();
  return true;
}

/** Invisible: mounted once on the household and family pages. */
export function NativeAppBridge() {
  const router = useRouter();
  useEffect(() => {
    const native = nativePlugin();
    const push = pushPlugin();
    if (!native) return;
    const listeners: { remove: () => Promise<void> | void }[] = [];
    void (async () => {
      if (push) {
        listeners.push(await push.addListener("registration", (t) => void registerThisPhone(t.value)));
        listeners.push(
          await push.addListener("pushNotificationActionPerformed", (a) => {
            const path = safeAppPath(a.notification.data?.url);
            if (path && path !== window.location.pathname) router.push(path);
          }),
        );
        // Already allowed: refresh the token (it changes after a reinstall). Never prompts here.
        const { receive } = await push.checkPermissions();
        if (receive === "granted") await push.register();
        else await registerThisPhone();
      } else {
        await registerThisPhone();
      }
      const openShare = () => {
        if (!window.location.pathname.startsWith("/family/share")) router.push("/family/share/");
      };
      listeners.push(await native.addListener("shareReceived", openShare));
      const { items } = await native.getSharedItems();
      if (items.length) openShare();
    })().catch(() => undefined);
    const onHide = () => {
      if (document.visibilityState === "hidden") void native.refreshWidgets().catch(() => undefined);
    };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      for (const l of listeners) void l.remove();
    };
  }, [router]);
  return null;
}

/** "This Phone" on the family page in the app: notifications, sharing when you're home, and the wall. */
export function ThisPhoneCard() {
  const [app, setApp] = useState(false);
  const [reg, setReg] = useState<Registered | null>(null);
  const [location, setLocation] = useState<LocationState | null>(null);
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!inNativeApp() || !nativePlugin()) return;
    // The app only runs on the client, and this card only exists there.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time check of where we're running
    setApp(true);
    void registerThisPhone().then(setReg);
    void nativePlugin()
      ?.locationState()
      .then(setLocation)
      .catch(() => undefined);
  }, []);

  if (!app) return null;
  const device = reg?.device;

  async function save(prefs: Partial<Pick<PublicDevice, "notifyMessages" | "notifyAlerts" | "sharePresence">>) {
    if (!device) return;
    const r = await fetch(`/api/mobile/devices/${encodeURIComponent(device.id)}/`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(prefs),
    }).catch(() => null);
    if (!r?.ok) return setNote("Couldn't save that. Try again.");
    const { device: saved } = (await r.json()) as { device: PublicDevice };
    setReg((old) => (old ? { ...old, device: saved } : old));
  }

  async function enablePush() {
    setBusy("push");
    setNote("");
    const ok = await turnOnPush().catch(() => false);
    if (!ok) setNote("Notifications are off for Everydaypane. Turn them on in your phone's Settings.");
    // The token arrives through the bridge's listener; read back what the server has.
    window.setTimeout(() => void registerThisPhone().then(setReg), 1500);
    setBusy("");
  }

  async function togglePresence(on: boolean) {
    const native = nativePlugin();
    if (!native || !reg) return;
    setBusy("presence");
    setNote("");
    try {
      if (on) {
        if (!reg.home) {
          setNote("Set the home address in Household Settings › Location first.");
          return;
        }
        let state = await native.requestLocation();
        if (state.permission === "always") state = await native.startHomeGeofence({ ...reg.home, radius: HOME_RADIUS_M });
        setLocation(state);
        if (state.permission !== "always") {
          setNote("Allow location “Always” for Everydaypane so it can tell when you get home.");
          return;
        }
        await save({ sharePresence: true });
      } else {
        await native.stopHomeGeofence();
        setLocation(await native.locationState());
        await save({ sharePresence: false });
      }
    } finally {
      setBusy("");
    }
  }

  return (
    <section
      className="mx-auto grid w-full max-w-xl gap-3 rounded-2xl border border-line bg-panel p-4"
      aria-labelledby="this-phone-heading"
    >
      <h2 id="this-phone-heading" className="text-lg font-bold">
        This Phone
      </h2>
      {!device ? (
        <p className="text-sm text-soft">Connecting…</p>
      ) : (
        <>
          {device.push ? (
            <div className="grid gap-2">
              <Toggle label="New Messages" checked={device.notifyMessages} onChange={(v) => void save({ notifyMessages: v })} />
              <Toggle label="Alerts and Laundry Done" checked={device.notifyAlerts} onChange={(v) => void save({ notifyAlerts: v })} />
            </div>
          ) : (
            <div className="grid gap-2">
              <p className="text-sm text-soft">
                Get a notification when someone leaves a note, an alert reaches the wall or the laundry is done.
              </p>
              <button type="button" className="btn-primary justify-self-start" disabled={busy === "push"} onClick={() => void enablePush()}>
                {busy === "push" ? "Asking…" : "Turn On Notifications"}
              </button>
            </div>
          )}
          <Toggle
            label="Share When I'm Home"
            hint="Uses your location only to notice arriving home and leaving. Off until you switch it on."
            checked={device.sharePresence && location?.active === true}
            disabled={busy === "presence"}
            onChange={(v) => void togglePresence(v)}
          />
          <p className="text-sm text-soft">
            Add the Everydaypane widget to your home screen for dinner, the shopping list and chores at a glance.
          </p>
          <a className="btn-ghost justify-self-start" href="/display/">
            Use This Screen as a Wall Display
          </a>
        </>
      )}
      {note && (
        <p className="text-sm text-bad" role="alert">
          {note}
        </p>
      )}
    </section>
  );
}

function Toggle(props: { label: string; hint?: string; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start justify-between gap-3 text-sm">
      <span className="grid gap-0.5">
        <span className="font-semibold">{props.label}</span>
        {props.hint && <span className="text-soft">{props.hint}</span>}
      </span>
      <input
        type="checkbox"
        role="switch"
        className="mt-1 h-5 w-5 shrink-0 accent-brand"
        checked={props.checked}
        disabled={props.disabled}
        onChange={(e) => props.onChange(e.target.checked)}
      />
    </label>
  );
}
