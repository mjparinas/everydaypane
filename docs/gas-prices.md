# Gas prices

The **Gas prices** widget (`gasPrices`) lists the cheapest (or nearest) gas stations around the dashboard's home
address for one fuel: regular, mid-grade, premium or diesel. It is a Household widget.

## Where the prices come from

Google's **Places API (New)**. A Nearby Search for `gas_station` around home returns each station's `fuelOptions`:
the last known price of every fuel it sells and when that price was updated (`src/server/gas.ts`).

Why Google (Claude's pick, 2026-11-26):

- **GasBuddy** has no public API. Its website's GraphQL endpoint is unofficial, against its terms of service and
  behind bot protection, and Everydaypane doesn't route around blocking.
- **Natural Resources Canada** publishes city averages (Vancouver, Abbotsford), but its pages are closed to automated
  readers in `robots.txt` and were months behind when checked.
- Google is official, covers individual stations, and its prices are the ones people see in Google Maps.

Google has prices for many, not all, stations. A station without any price is left out, and a price older than three
days isn't shown.

## Setup (once, for the whole platform)

1. In the Google Cloud console, pick (or create) a project with billing switched on.
2. **APIs & Services › Library** → enable **Places API (New)**.
3. **APIs & Services › Credentials** → **Create credentials › API key**. Restrict it to **Places API (New)**. The
   server sends it as the `X-Goog-Api-Key` header, so no website restriction is needed (don't add an HTTP referrer one).
4. In Vercel, set `GOOGLE_MAPS_API_KEY` for Production and redeploy.

Until the key is set, the widget says "Gas prices aren't set up yet" and the server never calls Google.

## Cost

Asking for `fuelOptions` bills each search at Google's **Nearby Search Enterprise + Atmosphere** rate: the first 1,000
a month are free, then about US$40 per 1,000 (Google's price list, read 2026-11-26). Each household's search is kept
two hours and shared by all of its gas widgets and displays, so a household costs about 360 searches a month. One search
covers the farthest radius any of the household's gas widgets asks for (up to 15 km, 20 nearest stations).

Set a budget alert on the Cloud project. To stop all calls at once, switch **Gas prices** off in `/admin/` › Flags.

## Google's rules

- Places content may only be kept briefly, so the two-hour copy is per household and never shared between households.
- Places data shown away from a Google map must credit Google, so the widget's foot always reads "Google Maps".

This sandbox can't reach Google, so the tests use the shapes Google documents for `Place`, `FuelOptions`, `FuelPrice`
and `Money`.
