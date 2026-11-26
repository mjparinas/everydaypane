# Package tracking (17TRACK)

The Packages widget shows the tracking numbers typed into its settings. With a 17TRACK API key saved, each one also
gets live status, the latest scan and the carrier's expected delivery day, and the widget leads with today's deliveries
("2 deliveries today": out for delivery, ready for pickup, due today or delivered today).

17TRACK was picked (2026-11-26) because one key covers Canada Post, Purolator, UPS, FedEx, DHL, USPS and most other
carriers and works out the carrier from the number. The carriers' own APIs each need a business account (Canada Post
a customer number, Purolator an account), and AfterShip's tracking API is paid-only.

## Set up

1. Make a free account at [17track.net](https://www.17track.net) and open the API dashboard at
   [api.17track.net](https://api.17track.net) (sign in with the same account).
2. Under **Settings › Security**, copy the access key.
3. In Everydaypane, open **Household › Settings › Family tools › Packages (17TRACK)**, paste the key and tap
   **Connect 17TRACK**. It is checked with 17TRACK (which uses none of its quota) and saved encrypted; it is never sent
   back to a browser or a display.
4. Add tracking numbers on a Packages widget. "Work it out from the number" is the default carrier; pick one only if
   17TRACK guesses wrong.

## Quota

17TRACK counts each **new tracking number** against the key's quota (a free account comes with a small one; Settings
shows how many are left). Reading a number's status after that is free. Everydaypane registers each number once per
household and remembers it, so the 15-minute refresh never spends quota. Replacing the key forgets that list, because a
new key is a different 17TRACK account.

## How it works

- `src/server/packages.ts`: `register` for new numbers (tried again without the carrier if 17TRACK refuses the pick),
  then `gettrackinfo` for status, cached 15 minutes per household and shared by every display. `getquota` checks a key.
- `src/lib/packages.ts`: 17TRACK's statuses, what counts as today in the dashboard's time zone, and the order.
- Displays poll `/api/display/packages/` every five minutes; the widget loads on its own (`packages.js`).
- The widget's **Only today's deliveries** hides everything else; **Show packages delivered before today** keeps older
  deliveries on the list (delivered today always shows).

This sandbox can't reach 17TRACK, so tests use the shapes in its v2.2 documentation.
