/**
 * A new release reloads the wall once (2026-11-25). If the page that comes back still names the old release (the
 * service worker's offline copy of the page, an old browser that can't refetch it, a deploy still rolling out), the
 * wall keeps running instead of reloading again: on Melvin's UC-Display21 that turned into a black screen reloading
 * every few seconds. The 3:30 AM reload tries again later.
 */
const RELEASE_RELOAD_KEY = "everydaypane.releaseReload";
export function reloadForRelease(release: string, reload: () => void = () => location.reload()): boolean {
  try {
    if (localStorage.getItem(RELEASE_RELOAD_KEY) === release) return false;
    localStorage.setItem(RELEASE_RELOAD_KEY, release);
  } catch {
    // No storage: never reload for a release, since nothing would stop a loop.
    return false;
  }
  reload();
  return true;
}
