# Oura ring

Household only. The **Oura** widget shows last night's sleep score, today's readiness score and the activity score
(with steps) from one Oura ring. It reads Oura's API v2 directly; no Home Assistant.

Oura removed personal access tokens in December 2025, so the dashboard connects through an Oura **API application**
(OAuth). It asks only for the `daily` scope and never writes anything to Oura.

## One-time setup (Melvin)

1. Sign in at [cloud.ouraring.com](https://cloud.ouraring.com/oauth/applications) with the Oura account and create a
   new API application.
   - Redirect URI: `https://www.everydaypane.com/api/oura/callback/` (add `http://localhost:3000/api/oura/callback/`
     too for local development).
   - Scopes: tick **daily**. The others aren't used.
2. Copy the **Client ID** and **Client Secret** into Vercel as `OURA_CLIENT_ID` and `OURA_CLIENT_SECRET`
   (Production), then redeploy.
3. In the household panel: **Settings › Content & finance › Oura › Connect Oura**, sign in with the ring's Oura
   account and allow access.
4. Add the **Oura** widget (Add widget › News & fun) and pick which scores it shows.

An unapproved Oura application works for up to 10 Oura accounts, which is plenty for one household.

## Privacy on the wall

By default the widget shows only the three scores. **Show last night's details** adds hours asleep, bedtime, HRV and
lowest heart rate; it is off by default because anyone in the kitchen can read the screen. The server sends those
details to displays only when some Oura widget has that switch on.

## Good to know

- Oura serves data only while the ring has an active **Oura Membership**; otherwise the widget says so.
- New numbers arrive after the Oura phone app syncs the ring. Until then the widget shows the latest day it has, with
  "From Mon, Nov 23. Open the Oura app to sync."
- Oura's refresh tokens work once. The server stores the access token (encrypted, like every other token) so that only
  one refresh happens at a time; if the widget ever says to connect again, use **Connect Oura** once more.
- **Disconnect** forgets both tokens and asks Oura to revoke access. You can also remove the app from the Oura account
  on Oura's site.
