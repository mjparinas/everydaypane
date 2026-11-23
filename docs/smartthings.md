# SmartThings

Household only. Lights, thermostats and **locks (lock only, never unlock)** on **Smart device** tiles (`haEntity`, provider **SmartThings**).

## Developer workspace

1. [SmartThings Developer Workspace](https://smartthings.developer.samsung.com/) — create an OAuth client.
2. Redirect URI: `https://<your-site>/api/smart-home/smartthings/callback/`
3. Scopes: device read and write as configured in the app (Everydaypane requests `r:devices:* w:devices:* x:devices:*`).

## Vercel

- `SMARTTHINGS_CLIENT_ID`
- `SMARTTHINGS_CLIENT_SECRET`

## In the admin panel

**Settings › Smart home › SmartThings** — Connect, then use a device id like `smartthings.kitchen_light` on the widget.