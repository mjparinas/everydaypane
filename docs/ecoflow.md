# EcoFlow power stations

Household only. The **EcoFlow** widget shows each power station's battery level, power in and out, solar input, AC
and DC flows, and how long until it is full or empty. It reads EcoFlow's own cloud API (the IoT Developer Platform),
so it needs no Home Assistant.

## Setup

1. Go to [developer.ecoflow.com](https://developer.ecoflow.com) (Europe: developer-eu.ecoflow.com) and sign in with
   the **same account as the EcoFlow app**, the one your devices are added to.
2. Apply to become a developer (**Become a Developer**). EcoFlow approves it by email, usually within a few days.
3. Once approved, open **Security** (or **Access Key**) and create a key pair. Copy the **access key** and the
   **secret key**; the secret key is shown only once.
4. In Everydaypane, open **Settings › EcoFlow**, paste both keys and tap **Save keys**. Your devices appear in a
   list under it, by the names they have in the EcoFlow app.
5. Add an **EcoFlow** widget to a view (Home group). In its settings, pick which devices to show (none picked shows
   them all, up to eight) and whether to show solar, AC and DC flows and time to full or empty.

The keys are stored encrypted on the server and never reach a wall screen or a browser. **Remove keys** in Settings
deletes them.

## How it works

- Every request is signed with HMAC-SHA256 using the secret key (`src/server/ecoflow.ts`).
- EcoFlow runs regional servers (`api-a`, `api-e` and `api.ecoflow.com`); a key works only on its own region's
  server, so Everydaypane tries each and remembers the one that answers.
- The device list is read every ten minutes, and each device's readings at most once a minute, shared by every
  display. A device that doesn't answer shows as offline without hiding the others.
- EcoFlow names its readings differently per product line. Delta 2, River 2, Delta Max and Delta Pro, the Delta 3,
  River 3 and Delta Pro 3 families, PowerStream and Smart Plugs are read; a reading a device doesn't report is left
  off the wall. If one of your devices shows only its name, tell Claude which model it is.
