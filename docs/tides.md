# Tides on Everydaypane

The **tides** widget shows the next high and low tides at a station you pick, and (on by default for new widgets) the
day's tide curve: the predicted water level from two hours ago to about 22 hours ahead, with a dashed line at now.

## Picking a station

In the widget's settings, **Find a station** searches Canada's stations (Fisheries and Oceans' IWLS list) and NOAA's
US stations by name. Near Langley: **White Rock** (`iwls:07577`), **Crescent Beach** (`iwls:07579`) and
**Point Atkinson** (`iwls:07795`).

- **Canada:** `iwls:` plus the five-digit station number from the tide tables. The server looks up IWLS's own id for it
  once a day. The first default, `iwls:8320`, is read as Point Atkinson.
- **United States:** NOAA's numeric ids (for example `9447130` for Seattle).

Data is cached on the server for about 45 minutes. Displays poll `/api/display/tides/` every 15 minutes, and the "now"
line moves once a minute on the wall.

## Sources

- Canada: [IWLS](https://api.iwls-schw.ca/) (`wlp-hilo` for highs and lows, `wlp` for the curve; no key). Its highs
  and lows aren't labelled, so each is a high when it sits above its neighbours.
- US: [NOAA CO-OPS](https://tidesandcurrents.noaa.gov/) predictions API (`hilo` and 30-minute predictions; no key).
