/** Path and URL for the phone edit page on a display link (Melvin, 2026-11-22: `/d/<token>/edit`). */

/** Display tokens are alphanumeric; keep the path readable in the Displays tab and QR payload. */
export const editPagePath = (token: string) => `/d/${token}/edit/`;

export function editPageUrl(origin: string, token: string): string {
  return `${origin.replace(/\/$/, "")}${editPagePath(token)}`;
}
