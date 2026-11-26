# Rachio sprinklers

Household only. The **Sprinklers** widget (`rachio`) shows each Rachio controller's next watering (when, which
schedule, how long and which zones) and, when the widget allows it, a **Skip** button on the wall. It reads Rachio's
official public API (`api.rach.io/1/public`) directly, with no Home Assistant. Nothing goes in Vercel: each household
pastes its own API key.

## Set it up

1. Get your API key from Rachio: in the **Rachio phone app**, tap the **Profile** icon, then **API Key › Copy**; or at
   [app.rach.io](https://app.rach.io), open **Account settings** and click **Get API key**.
2. In Everydaypane: **Settings › Home & devices › Sprinklers (Rachio)**. Paste the key and tap **Connect Rachio**.
   Everydaypane checks it with Rachio first, then saves it encrypted on the server. The panel lists your controllers.
3. Add a **Sprinklers** widget (Home group) to a view. In its settings you can turn **Skip from the wall** and **Show
   zones** on or off and, with several controllers, pick which to show (none picked shows them all).

## Skipping from the wall

Skip needs two taps (the button says "Tap again to skip"), because a skip can't be undone from the wall and anyone in
the kitchen can reach the screen. Turn **Skip from the wall** off to show the schedule only.

- For a fixed schedule, Everydaypane asks Rachio to skip that schedule's next run (`schedulerule/skip`).
- Rachio refuses that for Flex schedules and for some controllers ("not supported for 3.0 API"). Then Everydaypane sets
  a **rain delay** that ends one minute after that watering would have finished. Because it is the next watering,
  nothing else is held back; the Rachio app shows the rain delay, and you can clear it there.
- A watering more than seven days away can't be skipped this way (Rachio's longest rain delay).

After a skip the wall shows the watering after it. A watering already running shows "Watering now" with no Skip.

## Limits

Rachio allows 1,700 API calls a day per key. Everydaypane reads your account and each controller's next two weeks of
schedule every 10 minutes, shared by every display: about 150 calls a day per controller.

Rachio doesn't document the fields of its upcoming-schedule answer (`device/<id>/scheduleitem`), so they are read
leniently (`src/server/rachio.ts`). If the widget says "No upcoming waterings listed", Rachio sent nothing it could
read; the schedule in the Rachio app is unaffected.
