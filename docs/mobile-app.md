# Everydaypane app for iPhone, iPad and Android

The app lives in `mobile/` (Capacitor 8). It opens the live site at `https://www.everydaypane.com/app/`, which sends
household admins to Household and everyone else to Family, so **web changes reach the app without a new store
release**. A new release is only needed when something in `mobile/` changes.

What the app adds on top of the website:

| Feature | iPhone / iPad | Android |
| --- | --- | --- |
| Push notifications: new message board notes, new alerts, washer or dryer done | APNs (token key) | Firebase Cloud Messaging |
| Share › Everydaypane: photos to the photo frame, text and links to shopping or dinner | Share extension | Share intent |
| Home-screen widget: dinner tonight, shopping list, chores left | WidgetKit (small, medium, large) | App widget (resizable) |
| Wall mode on `/display/`: screen stays on, status bar hidden (Android: navigation bar too) | Yes | Yes |
| Share When I'm Home (opt-in home geofence, for a future phone-based "who's home") | Region monitoring | Play services geofence |

The phone's settings are the **This Phone** card on the Family page (only shown in the app). Plans are not sold in the
app: inside it the upgrade dialog shows no price or checkout, and the marketing and pricing pages open `/app/`.

## What you need to do

Everything below is a one-time setup. Steps marked **(you)** need your accounts; nothing else needs code.

### 1. Developer accounts (you)

1. **Apple Developer Program**: enrol at [developer.apple.com/programs](https://developer.apple.com/programs/) (US$99 a
   year). Enrol as an individual, or as an organisation if you want the seller name to be a company (needs a D-U-N-S
   number, takes a few days).
2. **Google Play Console**: sign up at [play.google.com/console](https://play.google.com/console/) (US$25 once).
   New personal accounts must run a **closed test with at least 12 testers for 14 days** before production access is
   granted, so start the internal/closed test early.

### 2. Apple identifiers (you, at developer.apple.com › Certificates, Identifiers & Profiles)

1. **App Groups** › add `group.com.everydaypane.app`.
2. **Identifiers** › App IDs, add three with these bundle IDs:
   - `com.everydaypane.app` with capabilities **Push Notifications** and **App Groups** (pick the group above).
   - `com.everydaypane.app.share` with **App Groups**.
   - `com.everydaypane.app.widget` with **App Groups**.
3. **Keys** › add a key with **Apple Push Notifications service (APNs)** enabled. Download the `.p8` file (you can only
   download it once) and note the **Key ID** and your **Team ID** (top right of the page).
4. In **Vercel** › everydaypane › Settings › Environment Variables (Production), add:
   - `APNS_KEY_ID` = the Key ID
   - `APNS_TEAM_ID` = your Team ID
   - `APNS_PRIVATE_KEY` = the whole contents of the `.p8` file, including the BEGIN and END lines
   - `APNS_BUNDLE_ID` = `com.everydaypane.app` (optional; this is the default)

   Then redeploy. Admin › System shows "Apple Push (APNs)" as Set.

### 3. Firebase for Android notifications (you)

1. At [console.firebase.google.com](https://console.firebase.google.com/) create a project named Everydaypane (Google
   Analytics can stay off).
2. **Add app › Android**, package name `com.everydaypane.app`. Download `google-services.json` and put it at
   `mobile/android/app/google-services.json`. It isn't a secret (it's built into every APK), so it can be committed;
   send it to me and I'll add it, or commit it yourself.
3. **Project settings › Service accounts › Generate new private key**. In Vercel add `FCM_SERVICE_ACCOUNT` = the whole
   JSON file (or it base64 encoded). This one **is** a secret: Vercel only, never the repo.
4. iOS doesn't use Firebase; it goes straight to Apple.

### 4. Build and run on your Mac (you)

Needs a Mac with Xcode 26 (App Store) and Android Studio, plus Node 22.

```bash
cd mobile
npm ci
npx cap sync            # copies config into both native projects
npx cap open ios        # opens Xcode
npx cap open android    # opens Android Studio
```

In **Xcode**, for each of the three targets (App, ShareExtension, EverydaypaneWidget): Signing & Capabilities › tick
**Automatically manage signing** and pick your team. Check that App has Push Notifications and App Groups, and the two
extensions have App Groups (the entitlements files are already in the project). Run on your iPhone or iPad.

In **Android Studio**, wait for Gradle sync and press Run with your phone plugged in (USB debugging on).

Push notifications only arrive on a real device. Development builds from Xcode use Apple's sandbox, release builds
the production APNs server; the app reports which, so the server picks the right one.

### 5. Store listings (you)

**App Store Connect** › My Apps › New App: name Everydaypane, bundle ID `com.everydaypane.app`, SKU `everydaypane`.
Then in Xcode: Product › Archive › Distribute App › App Store Connect, and submit from TestFlight.

**Play Console** › Create app. In Android Studio: Build › Generate Signed App Bundle, create an upload keystore (keep
it and its passwords safe, outside the repo; Play App Signing holds the real key), upload the `.aab` to a closed test.

Both stores need:

- Privacy policy URL: `https://www.everydaypane.com/privacy/`
- Support URL: `https://www.everydaypane.com/contact/`
- Screenshots: iPhone 6.9", iPad 13" and Android phone and tablet. The app on the Family page, the Share page and an iPad
  on `/display/` make good ones.
- A **demo account** for review: an email on a test household that App Review can sign in with (Clerk email codes need
  an inbox they can read, so set up a password-capable test user in Clerk or give them a code route in the notes).
- Data safety / App Privacy answers: email address (account), photos the user chooses to share, approximate location
  only if "Share When I'm Home" is on (home or away only, not coordinates), device push token. No tracking, no ads.
- Google Play's **background location declaration**: explain "Share When I'm Home" tells the family's wall when you
  arrive or leave home, is off until switched on, and record the short video Play asks for (switching it on in This
  Phone). If that review is a hassle, it's fine to ship the first version with the toggle and declaration and expect a
  back-and-forth.

### 6. Notes for App Review (paste into App Store Connect › App Review Information)

> Everydaypane is the companion app for a family's kitchen wall display. Native features: push notifications for
> family messages and local emergency alerts, a Share extension that sends photos to the family photo frame and text
> to the shopping list, a home-screen widget with tonight's dinner, the shopping list and chores, and a wall mode that
> keeps an iPad awake as the family display. Plans are not sold or advertised in the app (guideline 3.1.3(b),
> multiplatform service). Location is optional and used only to tell the household when this phone arrives or leaves
> home.

Two Apple rules to keep in mind:

- **Account deletion (5.1.1(v))**: done. **Delete Account** is at the bottom of Settings › Home and of the Family
  page, in the app and on the website. It shows what will go, then needs DELETE typed: a household whose only admin
  deletes their account is deleted with everything in it (its Household plan cancelled at Stripe first), other
  households just lose that person, and their Clerk sign-in is deleted. People on `ADMIN_EMAILS` / `FAMILY_EMAILS`
  and the grandfather household can't be deleted there. Mention it in the App Review notes if they ask.
- **Minimum functionality (4.2)**: the native features above are what make this more than a website in a frame; keep
  them on in the build you submit.

## Wall displays on a tablet

Open the app on the iPad or Android tablet, go to Family › This Phone › **Use This Screen as a Wall Display**, and
unlock it with the phone QR as usual. The app keeps it awake and full screen. For a locked kiosk:

- **iPad**: Settings › Accessibility › **Guided Access** on, open Everydaypane, triple-click the top button, Start. Keep it
  plugged in; the app stops it sleeping, so Auto-Lock can stay as it is.
- **Android**: Settings › Security › **App pinning** on, then pin Everydaypane from the recent apps screen.

## How it fits together

- `mobile/capacitor.config.json`: app id `com.everydaypane.app`, `server.url` (the live site), the hosts the app may
  navigate to (anything else opens in the browser), and the user agent suffix `EverydaypaneApp/1 (iOS|Android)` the
  site uses to know it's inside the app.
- Web side: `src/lib/nativeApp.ts` talks to the native bridge with no Capacitor package in our bundle;
  `src/components/NativeApp.tsx` registers the phone and draws This Phone; `src/components/ShareInbox.tsx` is the Share
  page. The wall display bundle is untouched: wall mode is applied natively when the URL is `/display/`.
- Server: `src/server/mobile.ts` (devices and app tokens, `mobile_devices`), `src/server/push.ts` (APNs and FCM),
  `src/server/mobileWidget.ts` and routes under `src/app/api/mobile/`.
- iOS native: `mobile/ios/App/App/` (AppViewController, EverydaypanePlugin), `ShareExtension/`,
  `EverydaypaneWidget/`, `Shared/` (App Group). `mobile/scripts/ios-targets.rb` adds the extension targets to the Xcode
  project and is safe to re-run after `npx cap add ios`.
- Android native: `mobile/android/app/src/main/java/com/everydaypane/app/`.
- CI: `.github/workflows/mobile.yml` builds both (unsigned) on every change to `mobile/`.

Changing the site address (`NEXT_PUBLIC_SITE_URL`) means changing `server.url` and `allowNavigation` in
`capacitor.config.json` and shipping a new app version.
