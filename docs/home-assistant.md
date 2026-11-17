# Connecting Home Assistant

Everydaypane's server (on Vercel) calls Home Assistant, so Home Assistant has to be reachable from the internet. This
uses a free Cloudflare Tunnel instead of Nabu Casa, and Cloudflare Access in front of it, so only Everydaypane's
server can get through (Melvin, 2026-11-17). About 20 minutes, once.

## 1. Tunnel: ha.getliftsmith.com → Home Assistant

1. In Home Assistant: **Settings › Add-ons › Add-on store › ⋮ › Repositories**, add
   `https://github.com/brenner-tobias/ha-addons`, then install **Cloudflared**.
2. In the add-on's **Configuration**, set **External Home Assistant hostname** to `ha.getliftsmith.com` and save.
3. Add this to Home Assistant's `configuration.yaml` (File editor or Studio Code Server add-on), then restart Home
   Assistant. Without it Home Assistant refuses requests that come through the tunnel.

   ```yaml
   http:
     use_x_forwarded_for: true
     trusted_proxies:
       - 172.30.33.0/24
   ```

4. Start the add-on and open its **Log**. The first time, it prints a Cloudflare link: open it, sign in to Cloudflare
   and pick **getliftsmith.com**. The add-on then creates the tunnel and the `ha` DNS record itself.
5. Check that `https://ha.getliftsmith.com` shows the Home Assistant sign-in page.

## 2. Lock it with Cloudflare Access

1. In Cloudflare, open **Zero Trust** (the free plan is enough).
2. **Access › Service credentials › Service Tokens › Create service token**, named `everydaypane`, duration
   **Non-expiring**. Copy the **Client ID** and **Client Secret** now: the secret is shown only once.
3. **Access › Applications › Add an application › Self-hosted**. Name it `Home Assistant`, domain
   `ha.getliftsmith.com`.
4. Add a policy: action **Service Auth**, include **Service Token** = `everydaypane`. Save the application.
5. Check that `https://ha.getliftsmith.com` now shows a Cloudflare page instead of Home Assistant.

If you also use the Home Assistant phone app away from home through this address, Access will block it. Either add a
second policy (action **Allow**, include your email) for the browser, or keep the app on your home Wi-Fi.

## 3. Tell Everydaypane

1. In Home Assistant: your **profile › Security › Long-lived access tokens › Create token**, named `Everydaypane`.
   Copy it.
2. In the Everydaypane admin panel: **Settings › Home Assistant**.
   - Address: `https://ha.getliftsmith.com`, then **Save** (top of the page).
   - Paste the long-lived token and **Save token**.
   - Paste the Access **Client ID** and **Client Secret** and **Save service token**.
   - **Test connection** should say *Connected* with the number of entities.
3. Add **Home Assistant** and **Camera** widgets to a view and pick entities from the suggestions.
4. For the doorbell pop-up, pick the doorbell's ring entity from UniFi Protect (usually `event.<name>_doorbell`) and the
   camera to show.

The tokens are stored encrypted on the server and are never shown again or sent to a screen. To change one, remove it
and paste the new one.

## Music: Sonos and Spotify

The **Music** widget controls any Home Assistant `media_player`: play/pause, skip, volume, album art and, if you turn
on *Sources to play*, a list to start something.

- **Sonos:** Home Assistant finds Sonos speakers on its own (Settings › Devices & services › Sonos). Each room becomes
  `media_player.<room>`. Its sources are your **Sonos favourites** (and line-in/TV), so save the playlists and stations
  you want on the wall as favourites in the Sonos app.
- **Spotify:** add the **Spotify** integration in Home Assistant (it asks you to sign in to Spotify; controlling
  playback needs Spotify Premium). It makes `media_player.spotify_<name>`. Its sources are your **Spotify Connect
  speakers**, so the list moves the music to another room. It shows something only while Spotify is playing on some
  device.

Add a **Music** widget to a view and pick the player from the suggestions. Album art comes through our server, never
straight from Home Assistant.

## When it doesn't work

- *Cloudflare Access refused the request*: the Client ID or secret is wrong, or the Access policy isn't **Service Auth**
  with that token.
- *Home Assistant refused the access token*: create a new long-lived token and paste it again.
- *Home Assistant answered 400*: the `trusted_proxies` lines are missing from `configuration.yaml`, or Home Assistant
  wasn't restarted.
