# Nest (Google Device Access)

Household only. Nest thermostats and some lights show on **Smart device** tiles (`haEntity` with provider **Nest**) without Home Assistant.

## What you need

1. A **Google Device Access** project (paid subscription) at [Google Nest Device Access](https://console.nest.google.com/device-access).
2. Note the **Project ID** (`NEST_PROJECT_ID`).
3. A Google Cloud OAuth client (Web) with redirect URI  
   `https://<your-site>/api/smart-home/nest/callback/`  
   Use the same client as Google Calendar, or dedicated `NEST_CLIENT_ID` / `NEST_CLIENT_SECRET`.

## Vercel environment variables

- `NEST_PROJECT_ID` (required)
- `NEST_CLIENT_ID` and `NEST_CLIENT_SECRET` (optional if `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` are set)

## In the household panel

1. **Settings › Smart home › Nest** — Connect Google.
2. Add a **Smart device** widget, provider **Nest**, entity id from the connected device list (e.g. `nest.abc123`).

Everydaypane never controls door locks through Nest from the wall; use climate, light and sensor-style tiles only.

## Limits

Device Access billing and regional availability are between you and Google. Fixture tests cover mapping; live SDM calls need a subscribed project.