# iCloud Calendar on Everydaypane

Everydaypane reads iCloud calendars through a **published iCal (ICS) link**, the same as Google &ldquo;Secret address in iCal format&rdquo; or Outlook&rsquo;s subscribe link. There is no Apple sign-in on the server.

## Publish the calendar

1. On a **Mac**, open **Calendar** and make sure you are signed into the right iCloud account (Calendar › Settings › Accounts).
2. In the sidebar, **Control-click** the calendar you want on the wall (or right-click).
3. Choose **Share Calendar…** (or **Share** on older macOS).
4. Turn on **Public Calendar** and copy the **link** (it usually starts with `webcal://` or `https://`).
5. In Everydaypane: **Settings › Calendar links**, paste the address and **Add calendar**, then **Save**.

The link is stored encrypted on the server like other calendar links. Events show on schedule, week, month and up-next widgets within a few minutes.

## Notes

- You need a Mac (or iCloud.com with a published link) to turn on public sharing; iPhone Calendar alone does not expose the same publish URL.
- Published iCloud feeds can lag a few minutes behind the phone app.
- If Apple rotates the URL, remove the old link in Settings and add the new one.

## Privacy

Anyone with the link can read that calendar. Treat it like a password: only paste it into Everydaypane, not public posts.