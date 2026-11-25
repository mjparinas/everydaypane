# Airthings indoor air

Household only. The **Indoor air** widget (`airthings`) shows radon, CO₂, VOC, PM2.5, PM1, humidity and temperature
from your Airthings monitors, each coloured green, amber or red by Airthings' own levels. It reads Airthings' official
consumer API directly, with no Home Assistant. Nothing goes in Vercel: each household pastes its own API client.

## Your monitor has to sync to the Airthings cloud

The API only knows what a monitor has uploaded to your Airthings account.

- **View Plus, View Radon and other View monitors** have Wi-Fi and upload by themselves, about every 5 minutes.
- **Wave, Wave Plus, Wave Mini and Wave Radon** use Bluetooth only. They reach the cloud through an **Airthings Hub**
  (uploads about every 5 minutes), or by opening the **Airthings phone app** near the monitor, which syncs over
  Bluetooth. Without a hub, the wall shows the last time the app synced, and after three hours says "Last reading …".

If the reading shows in the Airthings app's cloud dashboard (dashboard.airthings.com), the wall can show it too.

## Set it up

1. Sign in at [dashboard.airthings.com](https://dashboard.airthings.com) with the account the monitors are on.
2. Go to **Integrations › API** and make a new **API client** (read-only is enough). Copy its **client id** and
   **client secret**.
3. In Everydaypane: **Settings › Home & devices › Indoor air (Airthings)**. Paste both and tap **Connect Airthings**.
   Everydaypane checks them with Airthings first, then saves them encrypted on the server. The panel then lists your
   devices.
4. Add an **Indoor air** widget (Weather & map group) to a view. In its settings, pick the readings and, if you have
   several monitors, which ones to show (none picked shows them all).

## Alerts on the red strip (optional)

Under **Settings › Indoor air** you can put two things on the alert strip:

- **High radon**: when a monitor reads 150 Bq/m³ (4 pCi/L) or more, Airthings' red level. Health Canada's guideline
  is 200 Bq/m³ as a long-term average; the short-term figure moves around, so treat a red day as a cue to air the
  room and watch the long-term average in the Airthings app.
- **High CO₂**: from a level you choose (1,500 ppm by default).

They show at "moderate", so the default strip threshold shows them, and they also appear in the Alerts widget. Each
monitor raises at most one alert of each kind a day; dismissing it hides it until the next day. A reading older than
six hours never raises one. If **Email new alerts** is on, these are emailed too.

## Limits

- Readings are read once every 5 minutes and shared by every display; the consumer API allows about 120 requests an
  hour per client.
- Levels are worked out on the server from the metric value, so an imperial dashboard (°F, pCi/L) uses the same
  bands.
- "Disconnect Airthings" deletes the saved client. To stop the API client entirely, delete it on
  dashboard.airthings.com too.
