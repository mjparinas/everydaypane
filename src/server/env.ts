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
  microsoftClientId: () => process.env.MICROSOFT_CLIENT_ID ?? "",
  microsoftClientSecret: () => process.env.MICROSOFT_CLIENT_SECRET ?? "",
  /** Azure AD tenant; `common` for work, school and personal Microsoft accounts. */
  microsoftTenant: () => process.env.MICROSOFT_TENANT || "common",
  // Direct Spotify and Sonos (docs/music.md): each from its own developer app.
  spotifyClientId: () => process.env.SPOTIFY_CLIENT_ID ?? "",
  spotifyClientSecret: () => process.env.SPOTIFY_CLIENT_SECRET ?? "",
  sonosClientId: () => process.env.SONOS_CLIENT_ID ?? "",
  sonosClientSecret: () => process.env.SONOS_CLIENT_SECRET ?? "",
  /** Commute times with live traffic (docs/commute.md). */
  tomtomKey: () => process.env.TOMTOM_API_KEY ?? "",
  // TransLink's open API (docs/translink.md): one key for the realtime departures feed.
  translinkKey: () => process.env.TRANSLINK_API_KEY ?? "",
  /** Optional package tracking (docs/packages.md): 17track, AfterShip-style aggregator. */
  packageTrackKey: () => process.env.PACKAGE_TRACK_API_KEY ?? "",
  todoistClientId: () => process.env.TODOIST_CLIENT_ID ?? "",
  todoistClientSecret: () => process.env.TODOIST_CLIENT_SECRET ?? "",
  dropboxClientId: () => process.env.DROPBOX_CLIENT_ID ?? "",
  dropboxClientSecret: () => process.env.DROPBOX_CLIENT_SECRET ?? "",
  boxClientId: () => process.env.BOX_CLIENT_ID ?? "",
  boxClientSecret: () => process.env.BOX_CLIENT_SECRET ?? "",
  flickrApiKey: () => process.env.FLICKR_API_KEY ?? "",
  flickrSecret: () => process.env.FLICKR_API_SECRET ?? "",
  smugmugApiKey: () => process.env.SMUGMUG_API_KEY ?? "",
  smugmugSecret: () => process.env.SMUGMUG_API_SECRET ?? "",
  cronSecret: () => process.env.CRON_SECRET ?? "",
  stripeSecretKey: () => process.env.STRIPE_SECRET_KEY ?? "",
  stripePriceId: () => process.env.STRIPE_PRICE_ID ?? "",
  stripeWebhookSecret: () => process.env.STRIPE_WEBHOOK_SECRET ?? "",
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
