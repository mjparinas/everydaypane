# Blue Riiot pool monitor

Household only. The **Pool** widget (`blueRiiot`) shows water temperature, pH, ORP, salinity and (after a test strip)
free chlorine from a Blue Riiot **Blue Connect**, each coloured green, amber or red by Blue Riiot's own ranges, with
the time the pool was last measured. Nothing goes in Vercel: each household signs in with its own Blue Riiot account.

## Unofficial: read this first

Blue Riiot publishes **no developer API**. Everydaypane reads the same cloud the Blue Riiot phone app uses
(`api.riiotlabs.com`), the way the community integrations do (pyblueriiot, Home Assistant's `blueconnect` custom
component). That means:

- It signs in with the **email and password you use in the Blue Riiot app**. Everydaypane stores both encrypted
  (AES-256-GCM, like every other secret) and never sends them back to a browser. Melvin agreed to this on 2026-11-26.
  If you'd rather not share your main password, invite a second email to the pool from the Blue Riiot app and use
  that one.
- Blue Riiot can change its API at any time without notice. If the widget starts saying "Couldn't reach Blue Riiot"
  while the app still works, the API has probably moved and the code in `src/server/blueRiiot.ts` needs updating.
- Readings are read every 15 minutes, shared by every display, to stay gentle on Blue Riiot's servers.

## How it works

1. `POST /prod/user/login` with the email and password returns short-lived AWS credentials (access key, secret key
   and session token, about an hour). They are kept in the server's memory only, never in the cache table.
2. Every other call is a `GET` signed with AWS Signature V4 for API Gateway (`eu-west-1`, `execute-api`):
   `/prod/swimming_pool` (pools), `/prod/swimming_pool/<pool>/blue` (Blue Connect serials) and
   `/prod/swimming_pool/<pool>/blue/<serial>/lastMeasurements?mode=blue_and_strip` (the latest readings).
3. Each reading carries Blue Riiot's ideal range (`ok_min`, `ok_max`) and usually a warning range (`warning_low`,
   `warning_high`). Green is inside the ideal range, amber outside it but inside the warning range, red past that.
   When Blue Riiot leaves a range out, pH falls back to 7.2–7.6 (warning 6.8–8.0), ORP to 650–750 mV (550–850) and
   free chlorine to 1–3 ppm (0.5–5); temperature and salinity are then shown without a colour.

## Set it up

1. In Everydaypane: **Settings › Home & devices › Pool (Blue Riiot)**. Enter the Blue Riiot app's email and
   password and tap **Connect Blue Riiot**. Everydaypane signs in first, then saves them. The panel lists your pools.
2. Add a **Pool** widget (Home group) to a view. In its settings, pick the readings and, with several pools, which
   ones to show (none picked shows them all).

A Blue Connect measures about every 20 minutes over Sigfox, less often over Wi-Fi or Bluetooth through the app. When
the newest reading is over three hours old the widget greys it and shows the day.

## Alerts on the red strip (optional, off by default)

**Pool water out of range on the alert strip** puts pH, ORP, free chlorine or salinity past Blue Riiot's warning
range on the strip ("moderate", so the default threshold shows it), once per pool, reading and day. Temperature never
raises one, and a reading older than six hours never does either. If **Email new alerts** is on, these are emailed too.
