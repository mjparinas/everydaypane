import "server-only";

// Every environment variable the server reads, in one place. Set them in Vercel (Project › Settings › Environment
// Variables), never in the repo. .env.example lists them for local development.
export const env = {
  databaseUrl: () => process.env.DATABASE_URL || process.env.TURSO_DATABASE_URL || "",
  databaseToken: () => process.env.DATABASE_AUTH_TOKEN || process.env.TURSO_AUTH_TOKEN || undefined,
  /** Signs test sessions and encrypts stored secrets. 32+ random characters. Changing it loses encrypted tokens. */
  sessionSecret: () => process.env.SESSION_SECRET ?? "",
  /** Clerk secret (sk_…). Household and staff identity. */
  clerkSecretKey: () => process.env.CLERK_SECRET_KEY ?? "",
  /** Clerk publishable key (pk_…). */
  clerkPublishableKey: () => process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "",
  /** Svix signing secret for Clerk webhooks (`user.created` → Free household). */
  clerkWebhookSecret: () => process.env.CLERK_WEBHOOK_SIGNING_SECRET ?? "",
  /** Platform staff (/admin/) and bootstrap admins for the grandfather household (comma separated). */
  adminEmails: () => list(process.env.ADMIN_EMAILS),
  /** Who may post on the family message board but not change the household dashboard. */
  familyEmails: () => list(process.env.FAMILY_EMAILS),
  /** CI / Playwright: signed test session cookies instead of Clerk. Never set in production. */
  authTestMode: () => process.env.AUTH_TEST_MODE === "1",
  /** Salt for cookieless visitor hashes on the marketing site. */
  analyticsSecret: () => process.env.ANALYTICS_SECRET ?? "",
  googleServiceAccountKey: () => process.env.GOOGLE_SERVICE_ACCOUNT_KEY ?? "",
  searchConsoleSite: () => process.env.SEARCH_CONSOLE_SITE || "sc-domain:everydaypane.com",
  bingWebmasterKey: () => process.env.BING_WEBMASTER_API_KEY ?? "",
  bingSiteUrl: () => process.env.BING_SITE_URL || "https://www.everydaypane.com/",
  githubToken: () => process.env.GITHUB_TOKEN ?? "",
  vercelToken: () => process.env.VERCEL_TOKEN ?? "",
  resendInboxKey: () => process.env.RESEND_INBOX_API_KEY ?? "",
  inboxDomains: () =>
    (process.env.INBOX_DOMAINS || "everydaypane.com")
      .split(",")
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean),
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
  nestProjectId: () => process.env.NEST_PROJECT_ID ?? "",
  nestClientId: () => process.env.NEST_CLIENT_ID ?? "",
  nestClientSecret: () => process.env.NEST_CLIENT_SECRET ?? "",
  ecobeeClientId: () => process.env.ECOBEE_CLIENT_ID ?? "",
  ecobeeClientSecret: () => process.env.ECOBEE_CLIENT_SECRET ?? "",
  smartthingsClientId: () => process.env.SMARTTHINGS_CLIENT_ID ?? "",
  smartthingsClientSecret: () => process.env.SMARTTHINGS_CLIENT_SECRET ?? "",
  wuApiKey: () => process.env.WU_API_KEY ?? "",
  finnhubKey: () => process.env.FINNHUB_API_KEY ?? "",
  gnewsKey: () => process.env.GNEWS_API_KEY ?? "",
  airportApiKey: () => process.env.AIRPORT_API_KEY ?? "",
  ynabClientId: () => process.env.YNAB_CLIENT_ID ?? "",
  ynabClientSecret: () => process.env.YNAB_CLIENT_SECRET ?? "",
  /** Per-account token in secrets is preferred; this seeds dev or single-tenant fallback. */
  ynabPersonalToken: () => process.env.YNAB_PERSONAL_TOKEN ?? "",
  fitbitClientId: () => process.env.FITBIT_CLIENT_ID ?? "",
  fitbitClientSecret: () => process.env.FITBIT_CLIENT_SECRET ?? "",
  slackClientId: () => process.env.SLACK_CLIENT_ID ?? "",
  slackClientSecret: () => process.env.SLACK_CLIENT_SECRET ?? "",
  trelloApiKey: () => process.env.TRELLO_API_KEY ?? "",
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
