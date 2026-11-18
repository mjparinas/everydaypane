# Music: Spotify and Sonos without Home Assistant

The **Music** widget can get its player from three places (Melvin, 2026-11-18: direct sign-in "along side" Home
Assistant):

- **Home Assistant:** a `media_player` from Home Assistant's Sonos or Spotify integration (see
  [home-assistant.md](home-assistant.md)). Nothing here changes it.
- **Spotify:** the Spotify account you connect, on whatever speaker it is playing.
- **Sonos:** one Sonos speaker, controlled through your Sonos account, together with whatever group it is in.

Each needs a free developer app, made once. The keys go in Vercel; the sign-in happens in the admin panel.

## Spotify

1. Go to <https://developer.spotify.com/dashboard>, sign in with your Spotify account, and **Create app**.
   - App name: Everydaypane. Description: anything.
   - **Redirect URI:** `https://pane.getliftsmith.com/api/music/spotify/callback/` (your `NEXT_PUBLIC_SITE_URL`
     followed by `/api/music/spotify/callback/`, with the slash at the end). Click **Add**.
   - APIs used: tick **Web API**. Accept the terms and **Save**.
2. Open the app's **Settings**. Copy the **Client ID**, then **View client secret** and copy that too.
3. In Vercel (Project › Settings › Environment Variables) add `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET`, then
   redeploy.
4. A new Spotify app is in **development mode**, which only lets in the Spotify accounts listed under the app's
   **User Management**. Add the email of each account you'll connect (your own is usually there already).
5. In the admin panel: **Settings › Music › Connect Spotify**, and sign in.

Then add a Music widget, set **Player from** to **Spotify**, and save. It shows whatever the account is playing on
any speaker (phone, Sonos, a smart speaker, the car). With **Sources to play** on, the list moves the music to
another Spotify Connect speaker.

**Spotify Premium** is needed to play, pause, skip or change the volume; Spotify refuses those for free accounts, and
the widget says so. Showing what's playing works on any account. Spotify only lists speakers that are awake, so a
speaker that has been idle for a while may need opening in the Spotify app once.

## Sonos

1. Go to <https://developer.sonos.com>, sign in (or create a developer account; it can be the same email as your
   Sonos account), and open **My Account › Integrations › New control integration**.
   - Name: Everydaypane. Fill in the contact fields.
   - Under **Keys**, create a key. Set its **Redirect URI** to
     `https://pane.getliftsmith.com/api/music/sonos/callback/`. No event callback is needed (displays poll).
2. Copy the **Key** and the **Secret**.
3. In Vercel add `SONOS_CLIENT_ID` (the key) and `SONOS_CLIENT_SECRET` (the secret), then redeploy.
4. In the admin panel: **Settings › Music › Connect Sonos**, sign in with your **Sonos account** (the one in the Sonos
   app) and allow access to your household.

Then add a Music widget, set **Player from** to **Sonos** and pick a speaker. The widget plays, pauses, skips and
sets the volume for that speaker's group, so if the kitchen is grouped with the living room both follow. **Sources
to play** lists your **Sonos favourites**; save the playlists and stations you want on the wall as favourites in the
Sonos app. Album art shows for streaming services; music played from a computer on your home network has art only
on the home network, so the widget leaves it out.

## How it works

- The server holds the refresh tokens, encrypted (`spotify.refreshToken`, `sonos.refreshToken`), and makes every call
  to Spotify and Sonos. Displays read one small feed, `/api/display/music/`, every five seconds, and the server reads
  Spotify and Sonos at most once every few seconds however many screens are polling.
- Only players on a widget are read or controlled, with a fixed set of actions; a speaker or favourite is chosen only
  from the account's own list.
- **Disconnect** under Settings › Music forgets the token here. To cut the app off on the service's side too, remove
  it from your Spotify account (spotify.com › Account › Manage apps) or the Sonos app (Account › Connected services).
