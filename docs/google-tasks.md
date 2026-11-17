# Google Tasks on the dashboard

Google Keep has no API for personal accounts, so the wall shows **Google Tasks** instead (Melvin, 2026-11-17). Tasks
are in Gmail, Google Calendar and the Google Tasks app, so anyone can add them from their phone. On the wall, a tap
ticks a task off (a second tap within four seconds undoes it).

## In Google Cloud (once)

Use the same project as the Google Calendar sign-in (console.cloud.google.com, check the project picker at the top).

1. **APIs & Services › Library**: search for **Google Tasks API** and tap **Enable**.
2. **Google Auth Platform › Data Access › Add or remove scopes**: tick
   `https://www.googleapis.com/auth/tasks` (search for "Tasks", or paste it under "Manually add scopes"), then
   **Update**, and **Save** at the bottom of the Data Access page.

Nothing changes in Vercel: the same `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are used.

## In the admin panel

1. Settings › **Google Tasks** › **Connect Google Tasks**, and allow access. Google may warn that the app isn't
   verified: tap **Advanced › Go to getliftsmith.com**. Your calendar (and Google Photos) stay connected.
2. Switch on the lists the wall may show, then **Save**.
3. Views › add a **Tasks** widget. In its settings, pick lists (none picked shows them all), how many tasks to show,
   due dates, and whether a tap ticks a task off.

Displays check for changes every minute, so a task added on a phone reaches the wall within about two minutes.
