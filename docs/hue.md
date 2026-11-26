# Philips Hue lights

Household only. Hue bulbs, strips and plugs on **Smart device** tiles (`haEntity`, provider **Philips Hue lights**):
tap on and off, brightness, and a row of colours for colour lights. Through Hue's official Remote API (the bridge's
own cloud link), with no Home Assistant and nothing extra running at home.

## Once, for the whole app (Melvin)

1. Sign in at [developers.meethue.com](https://developers.meethue.com) › **My Apps** › **Add new Hue Remote API app**.
2. **Callback URL**: `https://www.everydaypane.com/api/smart-home/hue/callback/` (it must match `NEXT_PUBLIC_SITE_URL`).
3. Copy the **ClientId** and **ClientSecret** into Vercel as `HUE_CLIENT_ID` and `HUE_CLIENT_SECRET`, then redeploy.

## Each household

1. The Hue bridge must be set up in the Hue app and signed in to a Hue account (Hue app › Settings › Hue Bridges ›
   the bridge › **Remote access** on).
2. **Settings › Smart home › Philips Hue › Connect Philips Hue**, sign in to Hue and allow Everydaypane.
3. **Views › Add widget › Smart device**, set **Provider** to **Philips Hue lights** and pick the light from **Device**.

The first time the wall reads the lights, Everydaypane presses the bridge's link button through Hue's cloud and asks
for its own bridge key (`hue.appKey`, encrypted with the OAuth token in `account_secrets`). It shows in the Hue app
under Settings › Apps as `everydaypane#wall`; removing it there just makes Everydaypane ask for a new one.

## How often it asks Hue

Every light comes from one list read (`/route/clip/v2/resource/light`) at most every 15 seconds per household, shared by
every display, so ten tiles still make one call. A tap shows on the wall right away; a change made in the Hue app or a
switch can take up to 15 seconds to appear. Colours go to Hue as CIE xy, converted from the swatch's RGB
(`src/lib/lightColour.ts`); Hue keeps each colour inside what the bulb can show.

## When something's wrong

- **"Philips Hue sign-in isn't set up on the server yet"**: `HUE_CLIENT_ID` / `HUE_CLIENT_SECRET` are missing in Vercel.
- **"Philips Hue stopped accepting the connection"**: connect again (Hue refresh tokens last about 16 weeks unused).
- **Tiles are empty but Hue is connected**: the bridge is offline or remote access is off in the Hue app.
- Only the bridge the Hue account authorized is reached; a second bridge on the same account isn't listed.
