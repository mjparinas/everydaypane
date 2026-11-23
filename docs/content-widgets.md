# Phase 5 content and finance widgets (Household)

## Finance

- **Stocks:** Yahoo Finance chart API by default; set `FINNHUB_API_KEY` for Finnhub quotes instead.
- **Crypto:** CoinGecko free tier (no key).
- **FX:** Frankfurter / ECB (no key).
- **YNAB:** Paste a personal access token under **Settings › Content & finance**, or set `YNAB_PERSONAL_TOKEN` on the server for development. Optional OAuth: `YNAB_CLIENT_ID` and `YNAB_CLIENT_SECRET`.
- **TradingView:** iframe embed; no key.

## Health, mail and headlines

- **Fitbit:** `FITBIT_CLIENT_ID` and `FITBIT_CLIENT_SECRET`; connect under Settings.
- **Gmail unread:** `/api/google/connect/?gmail=1` adds `gmail.readonly` to the Google connection.
- **RSS / News:** server-side fetch; optional `GNEWS_API_KEY` for the GNews source.
- **Dad joke / Quotes:** icanhazdadjoke.com and quotable.io (no keys).

## Social and embeds

- **Trello:** `TRELLO_API_KEY` on the server and a member token in Settings.
- **Slack:** `SLACK_CLIENT_ID` and `SLACK_CLIENT_SECRET`; read-only channel history.
- **Instagram:** public **post** embed only (not profiles).
- **YouTube, Vimeo, Google Maps:** iframes tear down under the screen saver like the earth widget.

## Airports

- METAR from Aviation Weather (no key). Optional `AIRPORT_API_KEY` (Aviationstack) for delay lines.