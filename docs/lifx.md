# LIFX lights

Household only. LIFX bulbs and strips on **Smart device** tiles (`haEntity`, provider **LIFX lights**): tap on and off,
brightness, and a row of colours for colour bulbs. Straight to LIFX's official cloud API, no Home Assistant.

## Get a token (once)

1. Sign in at [cloud.lifx.com](https://cloud.lifx.com) with the LIFX app's account.
2. **Settings** › **Personal access tokens** › **Generate new token**, give it a name ("kitchen wall") and copy it.

## In the household panel

1. **Settings › Smart home › LIFX** — paste the token and tap **Save token**. It is checked with LIFX first, then saved
   encrypted (`lifx.token` in `account_secrets`); it never reaches a browser or a wall screen.
2. **Views › Add widget › Smart device**, set **Provider** to **LIFX lights**, and pick the light from **Device**.

Nothing goes in Vercel: each household brings its own token.

## How often it asks LIFX

LIFX allows 120 requests a minute per token. Everydaypane reads every light in one call (`/v1/lights/all`) at most every
15 seconds per household, shared by every display, so a tap is never short of room. A tap shows on the wall right away;
a change made in the LIFX app can take up to 15 seconds to appear.

## When something's wrong

- **"LIFX didn't accept that token"**: copy it again, or generate a new one (a deleted token stops working at once).
- **A light says Unavailable**: LIFX reports it offline (switched off at the wall, or off Wi-Fi).
