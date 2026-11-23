# ecobee

Household only. ecobee thermostats on the wall through **Smart device** tiles (`haEntity`, provider **ecobee**).

## Developer app

1. Register at [ecobee Developers](https://www.ecobee.com/en-us/developers/).
2. Create an app with redirect URI  
   `https://<your-site>/api/smart-home/ecobee/callback/`
3. Scope: `smartWrite`

## Vercel

- `ECOBEE_CLIENT_ID`
- `ECOBEE_CLIENT_SECRET`

## In the household panel

**Settings › Smart home › ecobee** — Connect, then pick a device id on the widget (e.g. `ecobee.t123`).