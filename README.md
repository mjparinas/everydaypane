# Everydaypane

Your home, at a glance: a fast, good-looking wall dashboard for the UniFi UC-Display21 (or any screen), with an admin
panel that works on your phone.

- Clocks, date, weather for the week, air quality, countdowns, WiFi QR code
- Google Calendar (today and the month), garbage pickup, photos, a family message board
- TransLink departures from your stops, live
- Home Assistant controls and UniFi Protect cameras
- Emergency alerts for BC
- Drag-and-drop layouts, several views, time-of-day views, day and night themes, burn-in protection, offline mode

See [AGENTS.md](AGENTS.md) for how it's built and why.

## Develop

```bash
npm ci
cp .env.example .env.local   # set SESSION_SECRET and ADMIN_EMAILS
npm run dev
```
