# Govee lights

Household only. Govee bulbs, strips and plugs on **Smart device** tiles (`haEntity`, provider **Govee lights**): tap
on and off, brightness, a row of colours and the light's scenes. Straight to Govee's official cloud API, no Home
Assistant.

## Get an API key (once)

1. In the **Govee Home** app: **Profile** (bottom right) › **Settings** (gear) › **Apply for API Key**.
2. Give a name and a reason ("home dashboard"), agree, and submit. Govee emails the key, usually within minutes.
3. Only devices that work over Wi-Fi (not Bluetooth-only ones) show up in the API.

## In the household panel

1. **Settings › Smart home › Govee** — paste the key and tap **Save key**. It is checked with Govee first, then
   saved encrypted (`govee.apiKey` in `account_secrets`); it never reaches a browser or a wall screen.
2. **Views › Add widget › Smart device**, set **Provider** to **Govee lights**, and pick the light from **Device**.
   Colour swatches show for colour lights and a scene list for lights with scenes, while the light is on.

Nothing goes in Vercel: each household brings its own key.

## How often it asks Govee

Govee limits each key (its tables: the device list 30 a minute, a light's state and scenes 30 a minute per light,
control 2 a second per light; a 10,000-a-day cap is widely reported too). Everydaypane keeps the device list 10
minutes and each light's scenes a day, and reads each light's state at most once a minute, slower when many lights
are on the wall, so a full day stays under about 6,000 reads (`stateEveryMs` in `src/server/govee.ts`). A tap shows
on the wall right away; a change made in the Govee app can take a few minutes to appear.

## When something's wrong

- **"Govee didn't accept that key"**: copy the key again from Govee's email, with no spaces.
- **A light says Unavailable**: Govee reports it offline (unplugged, or off Wi-Fi).
- **Taps say "Couldn't reach the device"**: Govee answered with an error or a rate limit; try again in a minute.
