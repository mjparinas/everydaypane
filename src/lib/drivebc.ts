// DriveBC highway cameras (Melvin, 2026-11-25): still pictures from the Ministry of Transportation's public highway
// cameras, picked by camera id in the widget's settings. Kept free of zod so the admin, the server and the display
// can all import it.

/** Cameras one widget can show. Each one is a picture every refresh, so a few is plenty for a kitchen wall. */
export const DRIVEBC_MAX_CAMERAS = 4;

/** DriveBC's camera ids are whole numbers ("520"). Anything else never reaches DriveBC. */
export const isDriveBcId = (id: string) => /^\d{1,6}$/.test(id);

/** Lower Mainland cameras pick up a new picture every two to 15 minutes, so faster than a minute only repeats one. */
export const DRIVEBC_REFRESH = { min: 60, max: 900, default: 120 } as const;

/** DriveBC marks a picture late after 20 minutes without a new one (its own red timestamp bar). */
export const DRIVEBC_LATE_MS = 20 * 60_000;

/** The wall's short credit; the widget's settings carry the licence's own wording (DRIVEBC_LICENCE). */
export const DRIVEBC_CREDIT = "DriveBC · OGL-BC";
export const DRIVEBC_LICENCE =
  "Camera pictures from DriveBC. Contains information licensed under the Open Government Licence – British Columbia.";
