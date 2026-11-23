# Tides on Everydaypane

The **tides** widget shows the next high and low tides at a station you pick.

## Station ids

- **United States:** NOAA numeric ids (for example `9447130` for Seattle). Search in the widget settings or the admin tide-station lookup.
- **Canada (B.C.):** Canadian Hydrographic Service IWLS ids with an `iwls:` prefix (for example `iwls:8320` for Point Atkinson near Langley).

Data is cached on the server for about 45 minutes. Displays poll `/api/display/tides/` every 15 minutes.

## Sources

- US: [NOAA CO-OPS](https://tidesandcurrents.noaa.gov/) predictions API (no key).
- Canada: [IWLS](https://api.iwls-schw.ca/) (no key for predictions used here).