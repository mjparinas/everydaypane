# Commute times on the dashboard

The commute widget shows the drive from home to work, school or anywhere else, with live traffic (Melvin,
2026-11-19). Each place shows the drive time, how much traffic adds, and when you'd arrive if you left now. Give a
place a "be there by" time and, in the three hours before it, the widget says when to leave instead.

Drive times come from **TomTom's Routing API**. Its free tier is 2,500 requests a day with no credit card, which
covers six places refreshed every five minutes, all day. (Google's Routes API would need a billing account and charges
for traffic-aware routes after 5,000 a month.)

## Get a TomTom key (once)

1. Sign up at **developer.tomtom.com** (free, no card) and open the **Dashboard**.
2. Under **Keys**, copy the key it made for you (or **Create key**). It needs the **Routing API** and the **Search
   API**, which new keys have.
3. In Vercel: project `everydaypane` › **Settings › Environment Variables**, add `TOMTOM_API_KEY` with that key for
   Production, then **Redeploy** the latest deployment so it's picked up.

The key stays on the server. Displays never see it, and they never see the addresses either: only the place names and
drive times.

## In the admin panel

1. Settings › **Commute**: type your home address, tap **Find**, and pick the right match.
2. For each place, type a name (Work, School), then its address, tap **Add** and pick the match. Optionally give it an
   icon (🏢, 🏫) and a **Be there by** time. Up to six places.
3. **Save**.
4. Views › add a **Commute** widget. In its settings, pick the places (none picked shows them all), and whether to show
   the arrival time and the distance.

The server reads each drive at most every five minutes, shared by every display, so more screens don't cost more
requests. If TomTom has a bad minute, the last reading is shown; a reading older than 20 minutes shows as "No traffic
info right now" rather than an old time passed off as live.
