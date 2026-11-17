# Photos on the dashboard

Amazon refuses requests from our server, so Everydaypane keeps its own copies of the photos it shows, privately
(Melvin, 2026-11-17). There are two ways to add them, both from **Settings › Photos** in the admin panel.

## Set up an album (once)

1. Settings › Photos › **Add**: *Upload, or pick from Google Photos*. Give it a name and tap **Add photos**.
2. **Save** at the top of the page.
3. Put a **Photos** widget on a view. With no album picked it shows every album.

## Upload

Tap **Upload photos** under the album and choose as many photos as you like, from your phone or computer. They're
shrunk to screen size on your device before they're sent, so uploading is quick.

## Pick from Google Photos

This needs two one-time changes in Google Cloud, in the same project as the Google Calendar sign-in:

1. **APIs & Services › Library**: search for **Google Photos Picker API** and tap **Enable**.
2. **Google Auth Platform › Data Access › Add or remove scopes**: add
   `https://www.googleapis.com/auth/photospicker.mediaitems.readonly` (or paste it under "Manually add scopes"), then
   **Update** and **Save**.

Then, in Settings › Photos:

1. Tap **Connect Google Photos** under the album and allow access. Google may warn that the app isn't verified: tap
   **Advanced › Go to getliftsmith.com**. This also keeps your Google Calendar connected.
2. Tap **Pick from Google Photos**. Google's picker opens in a new window: choose photos (or an album) and tap **Done**.
3. Back in the admin panel, the photos are copied over. Leave the page open until it shows the new count.

## Removing photos

Tap **×** on a photo to remove it, or **Remove** on the album to delete the album and all its photos.
