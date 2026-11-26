# DriveBC highway cameras

The **Highway cameras** widget (`drivebc`) shows still pictures from up to four of DriveBC's public highway cameras
(Highway 1, the Port Mann, the Coquihalla and about a thousand others), refreshed on a timer. There is nothing to set
up: DriveBC's cameras need no key or sign-up.

## Adding cameras

1. In **Views**, add a widget and pick **Highway cameras** (Home group).
2. In its settings, type a name, a place or a highway into **Find a camera** (for example `Port Mann`, `hwy 1 langley`
   or `Coquihalla`), or leave it empty to list the cameras nearest the dashboard's location.
3. Tap a camera to add it. Up to four per widget.
4. Pick **New picture every** (1 to 15 minutes, 2 by default), and whether the cameras sit **side by side** or show
   **one at a time** in turn.

## How it works

- The camera list and each camera's status come from DriveBC's own site feed (`https://www.drivebc.ca/api/webcams/`),
  cached ten minutes. When that feed is down, the camera search uses the monthly open data list on the BC Data
  Catalogue ("BC HighwayCams").
- Pictures are `https://www.drivebc.ca/images/<id>.jpg`. Displays never fetch them directly: they come through
  `/api/display/drivebc/image/`, which only serves cameras on this household's widgets and keeps one copy a minute
  for every display.
- Nothing is fetched while the screen saver is up or the page is hidden; waking fetches whatever went out of date.
- A camera DriveBC marks delayed, or whose picture hasn't changed in 20 minutes, shows "Delayed" with the time of its
  last picture in red. A camera DriveBC has switched off says so.

Lower Mainland cameras take a new picture every two to 15 minutes; rural ones about every 15. Refreshing faster than
that only fetches the same picture again.

## Licence

DriveBC's camera pictures and list are released by the Ministry of Transportation and Transit under the
[Open Government Licence – British Columbia](https://www2.gov.bc.ca/gov/content/data/open-data/open-government-licence-bc).
The wall shows "DriveBC · OGL-BC" on the widget, and the widget's settings carry the licence's attribution line.
