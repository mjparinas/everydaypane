import "server-only";

// Every environment variable the server reads, in one place. Set them in Vercel (Project › Settings › Environment
// Variables), never in the repo. .env.example lists them for local development.
export const env = {
  databaseUrl: () => process.env.DATABASE_URL || process.env.TURSO_DATABASE_URL || "",
  databaseToken: () => process.env.DATABASE_AUTH_TOKEN || process.env.TURSO_AUTH_TOKEN || undefined,
  /** Signs sessions and encrypts stored secrets. 32+ random characters. Changing it signs everyone out and loses stored tokens. */
  sessionSecret: () => process.env.SESSION_SECRET ?? "",
  /** Who may sign in to the admin panel (comma separated). */
  adminEmails: () => list(process.env.ADMIN_EMAILS),
  /** Who may post on the family message board but not change the dashboard. */
  familyEmails: () => list(process.env.FAMILY_EMAILS),
  resendKey: () => process.env.RESEND_API_KEY ?? "",
  mailFrom: () => process.env.MAIL_FROM || "Everydaypane <onboarding@resend.dev>",
  siteUrl: () =>
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : ""),
  googleClientId: () => process.env.GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: () => process.env.GOOGLE_CLIENT_SECRET ?? "",
  // Direct Spotify and Sonos (docs/music.md): each from its own developer app.
  spotifyClientId: () => process.env.SPOTIFY_CLIENT_ID ?? "",
  spotifyClientSecret: () => process.env.SPOTIFY_CLIENT_SECRET ?? "",
  sonosClientId: () => process.env.SONOS_CLIENT_ID ?? "",
  sonosClientSecret: () => process.env.SONOS_CLIENT_SECRET ?? "",
  /** Commute times with live traffic (docs/commute.md). */
  tomtomKey: () => process.env.TOMTOM_API_KEY ?? "",
  // TransLink's open API (docs/translink.md): one key for the realtime departures feed.
  translinkKey: () => process.env.TRANSLINK_API_KEY ?? "",
  cronSecret: () => process.env.CRON_SECRET ?? "",
  isProduction: () => process.env.VERCEL_ENV === "production",
};

function list(v: string | undefined): Set<string> {
  return new Set(
    (v ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.includes("@")),
  );
}
