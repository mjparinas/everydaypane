// The Everydaypane app for iPhone, iPad and Android (Melvin, 2026-11-27) shows this site in a native shell. Capacitor
// injects its bridge into our pages there as `window.Capacitor`, so the household and family pages talk to the native
// side through it without bundling any Capacitor package: in a normal browser every call here is a no-op. Never
// imported by the wall display (`src/display/`), whose native extras (screen kept on, full screen) the app applies
// by itself when it sees `/display/`.

export interface SharedItem {
  kind: "image" | "text" | "url";
  /** For images: a `data:image/jpeg;base64,…` URL the app already shrank to at most 2048 px. */
  data?: string;
  width?: number;
  height?: number;
  name?: string;
  /** For text and links. */
  text?: string;
}

export interface NativeSession {
  deviceId: string | null;
  appToken: string | null;
}

export interface LocationState {
  /** iOS "always" / Android background location: what a geofence needs. */
  permission: "always" | "whenInUse" | "denied" | "prompt";
  active: boolean;
}

type Listener = { remove: () => Promise<void> | void };

interface EverydaypanePlugin {
  info(): Promise<{ platform: "ios" | "android"; pushEnv: "production" | "sandbox"; version: string; deviceName: string }>;
  getSession(): Promise<NativeSession>;
  setSession(opts: { deviceId: string; appToken: string | null; baseUrl: string }): Promise<void>;
  clearSession(): Promise<void>;
  refreshWidgets(): Promise<void>;
  getSharedItems(): Promise<{ items: SharedItem[] }>;
  clearSharedItems(): Promise<void>;
  locationState(): Promise<LocationState>;
  requestLocation(): Promise<LocationState>;
  startHomeGeofence(opts: { latitude: number; longitude: number; radius: number }): Promise<LocationState>;
  stopHomeGeofence(): Promise<void>;
  openSettings(): Promise<void>;
  addListener(event: "shareReceived", fn: () => void): Promise<Listener>;
}

interface PushPlugin {
  checkPermissions(): Promise<{ receive: "granted" | "denied" | "prompt" | "prompt-with-rationale" }>;
  requestPermissions(): Promise<{ receive: "granted" | "denied" | "prompt" | "prompt-with-rationale" }>;
  register(): Promise<void>;
  addListener(event: "registration", fn: (t: { value: string }) => void): Promise<Listener>;
  addListener(event: "registrationError", fn: (e: { error: string }) => void): Promise<Listener>;
  addListener(
    event: "pushNotificationActionPerformed",
    fn: (a: { notification: { data?: Record<string, unknown> } }) => void,
  ): Promise<Listener>;
}

interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
  nativePromise?: (plugin: string, method: string, options: unknown) => Promise<unknown>;
  addListener?: (plugin: string, event: string, fn: (data: never) => void) => Listener;
}

const cap = (): CapacitorGlobal | undefined =>
  typeof window === "undefined" ? undefined : (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;

/**
 * A native plugin as the bridge injected into a remote page exposes it: `nativePromise` for calls and `addListener`
 * for events (the `Capacitor.Plugins` table is only filled by @capacitor/core, which we don't ship).
 */
function plugin<T>(name: string): T | undefined {
  const c = cap();
  const call = c?.nativePromise;
  const listen = c?.addListener;
  if (!c?.isNativePlatform?.() || !call || !listen) return undefined;
  return new Proxy(
    {},
    {
      get: (_target, prop) =>
        // Not a thenable, so `await` on the plugin itself never calls into native code.
        prop === "then"
          ? undefined
          : prop === "addListener"
            ? (event: string, fn: (data: never) => void) => Promise.resolve(listen(name, event, fn))
            : (options?: unknown) => call(name, String(prop), options ?? {}),
    },
  ) as T;
}

/** True inside the Everydaypane app (user agent set by the app, so the server can tell too). */
export function inNativeApp(ua = typeof navigator === "undefined" ? "" : navigator.userAgent): boolean {
  return /EverydaypaneApp\//.test(ua);
}

/** "ios" or "android" in the app, else null. */
export function nativePlatform(ua = typeof navigator === "undefined" ? "" : navigator.userAgent): "ios" | "android" | null {
  if (!inNativeApp(ua)) return null;
  return /EverydaypaneApp\/\S+ \(Android\)/.test(ua) ? "android" : "ios";
}

export const nativePlugin = () => plugin<EverydaypanePlugin>("Everydaypane");
export const pushPlugin = () => plugin<PushPlugin>("PushNotifications");

/** A tapped notification's path, only if it is one of ours (never another site). */
export function safeAppPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return /^\/(?!\/)[A-Za-z0-9/_?=&.%#-]*$/.test(value) ? value : null;
}

/** Splits shared text into shopping items: one per line or comma, bullets and numbering dropped. */
export function sharedTextItems(text: string, max = 20): string[] {
  return text
    .split(/[\n,;]+/)
    .map((line) =>
      line
        .replace(/^\s*(?:[-*•·▢☐□✓✔]|\d+[.)])\s*/, "")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter((line) => line && line.length <= 80)
    .slice(0, max);
}

/**
 * Marketing and pricing pages inside the Everydaypane app (Melvin, 2026-11-27): the app opens on the household's own
 * pages, and App Store and Google Play rules don't allow selling plans there, so these go to `/app/` instead.
 */
export function appRedirect(path: string, ua: string): boolean {
  if (!inNativeApp(ua)) return false;
  return path === "/" || /^\/(pricing|compare|features|blog)(\/|$)/.test(path);
}
