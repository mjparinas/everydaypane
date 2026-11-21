# TransLink departures on the dashboard

The **TransLink** widget shows the next buses from a few stops near home, with minutes to go and whether each one is
running late (Melvin, 2026-11-19). Times come from TransLink's live GTFS-realtime feed; the server reads it every 30
seconds at most, whatever the number of screens, and displays ask the server, never TransLink.

## Get an API key (once)

1. Go to **developer.translink.ca** and register (it's free). Confirm the email TransLink sends.
2. Sign in and copy your **API key** from your account page.

## In Vercel

1. Project **everydaypane** › **Settings** › **Environment Variables** › **Add**.
2. Key `TRANSLINK_API_KEY`, value the key, environment **Production** (and Development if you run it locally).
3. **Deployments** › the latest one › **⋯** › **Redeploy**, so the new variable is picked up.

## In the admin panel

1. Views › add a **TransLink** widget (🚌).
2. In its settings, **Find a stop**: type the five-digit number on the bus stop sign (like 55210), part of its name
   (like "200 St"), or leave it empty and tap **Find** for the stops nearest the dashboard's location. Add up to six.
3. Optionally narrow it to some routes ("502, 503"), set how many departures each stop shows, and how many minutes the
   walk to the stop takes: buses leaving sooner than that are left out.
4. **Save**. Screens pick up the change within 30 seconds.

## What it shows

- **4 min**: minutes until the bus leaves the stop ("Now" under a minute; past an hour, the clock time).
- **3 min late / 2 min early / On time**: TransLink's prediction for a bus that is on its way.
- **Scheduled**: no bus is on that trip yet, so the time is the timetable's.
- "No departures in the next two hours": TransLink's feed has nothing for that stop soon (late at night, or a stop
  that the routes you picked don't serve).

## How it works

- **Live times:** `https://gtfsapi.translink.ca/v3/gtfsrealtime?apikey=…` (GTFS-realtime trip updates, protobuf). The
  server keeps only the stops on widgets and up to 20 departures each in the next two hours (`src/server/translink.ts`).
  The decoder is a few dozen lines in `src/server/gtfs.ts` rather than a protobuf library.
- **Names:** route numbers, headsigns and the stop list come from TransLink's static GTFS
  (`https://gtfs-static.translink.ca/gtfs/google_transit.zip`, no key needed), read every three days with range
  requests: only `routes.txt`, `trips.txt` and `stops.txt` are downloaded, never the big `stop_times.txt`. If it can't
  be read, departures still show, with TransLink's internal route ids.
- When TransLink doesn't answer, the last good departures are served; the minutes keep counting down on the wall.
- TransLink publishes no rate limit for the open API. One read every 30 seconds is about 2,900 a day.

## Terms

TransLink's open data licence asks for this notice, which the widget's settings show in full and the widget shows in
short ("Live times from TransLink"):

> Route and arrival data used in this product or service is provided by permission of TransLink. TransLink assumes no
> responsibility for the accuracy or currency of the Data used in this product or service.
