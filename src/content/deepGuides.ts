// The second batch of search-led guides (Melvin, 2026-11-27: "what other deep blog posts are missing", then "do them
// all"). Same rules as growthGuides.ts: each answers a search a family makes, shows 4–6 real pictures (wall pictures
// from `npm run templates:previews`, settings and phone shots of the real app) and ends at Start Free. Only features
// that exist go in here; check AGENTS.md before adding a claim.

import type { Block, Figure, Post } from "./posts";

const DATE = "2026-11-27";

function guide(slug: string, title: string, description: string, tag: string, image: string, body: Block[]): Post {
  return { slug, title, description, date: DATE, tag, kind: "guide", image, body: [...body, { cta: true }] };
}

/** A figure block. Sizes are the files' own pixels; marketing.test.ts checks them against the files. */
function fig(src: string, w: number, h: number, alt: string, caption?: string, size?: Figure["size"]): Figure {
  return { src, w, h, alt, ...(caption ? { caption } : {}), ...(size ? { size } : {}) };
}
const img = (f: Figure): Block => ({ img: f });
const wall = (name: string, alt: string, caption?: string) => fig(`/templates/${name}.png`, 1920, 1080, alt, caption);
const blogWall = (name: string, alt: string, caption?: string) => fig(`/blog/${name}.png`, 1920, 1080, alt, caption);
const widget = (name: string, w: number, h: number, alt: string, caption?: string) =>
  fig(`/features/widgets/${name}.png`, w, h, alt, caption);

export const DEEP_GUIDES: Post[] = [
  guide(
    "christmas-countdown-kitchen-wall",
    "A Christmas Countdown on the Kitchen Wall",
    "Put the days until Christmas where the kids can see them every morning, with the family's photos, the holiday plans and dinner on the same screen.",
    "Guides",
    "/templates/christmas.png",
    [
      {
        p: "Every December the same question comes up at breakfast: how many sleeps until Christmas? An advent calendar answers it once a day. A screen on the kitchen wall answers it all day long, next to the things December actually fills up with: the school concert, the cookie exchange, the drive to Grandma's and who's cooking what. This guide sets that up on a tablet, monitor or TV you already own.",
      },
      { h2: "What the Christmas Wall Shows" },
      {
        ul: [
          "**A countdown** to Christmas and to New Year's, counting the days and rolling over to next year by itself once the day has passed.",
          "**Family photos** as the backdrop, from an album you upload to, Google Photos, Amazon Photos or an iCloud shared album.",
          "**The holiday schedule** from Google Calendar, Microsoft 365 or any iCal link: concerts, parties, the last day of school.",
          "**The month at a glance**, so the week of Christmas and the days off are easy to see.",
          '**A note** for the house ("Elf moves tonight!") and **meals** for the big dinners, planned from a phone.',
        ],
      },
      { h2: "Start From the Christmas Template" },
      {
        p: "In the household panel, open **Views** and pick the **Christmas** starter template. It's a photos backdrop with a clock, the Christmas and New Year countdowns, a note, meals, today's schedule and a month calendar on top. Every tile can be moved, resized or removed, and the template is a starting point, not a lock-in. When January comes, the **New Year** template is its twin.",
      },
      img(
        wall(
          "new-year",
          "New Year wall template with a countdown to midnight, photos and the week ahead",
          "The New Year template takes over when the decorations come down.",
        ),
      ),
      { h2: "Add the Dates That Matter to Your Family" },
      {
        p: "Christmas is only one date. Open the **Countdowns** widget's settings and add the ones your kids are actually waiting for: the last day of school, the trip to the cabin, a cousin's visit, Boxing Day hockey. Each date can be a holiday, a birthday, an anniversary or an event, with an emoji and, if you like, a photo. Yearly ones come back on their own next December.",
      },
      img(
        fig(
          "/features/widgets/countdown.png",
          480,
          480,
          "Countdowns widget celebrating a birthday with a photo, with an anniversary and Christmas below",
          "On the day a countdown becomes the celebration. Christmas, 32 days out, waits its turn below.",
          "narrow",
        ),
      ),
      {
        tip: "On the day itself the countdown leads the tile with its photo large. A Christmas morning picture from last year makes a good one.",
      },
      { h2: "Make It Feel Different in the Evening" },
      {
        p: "On the Household plan, views can change by time of day. A practical December setup: the full Christmas wall in the morning and after school, a calmer photo view in the evening with just the clock and the countdown, and a dark night clock overnight. Each part of the day can start at a fixed time or at sunrise and sunset, which in December in B.C. is barely after four.",
      },
      img(
        fig(
          "/features/time-of-day.png",
          1920,
          1200,
          "Four versions of the wall for morning, afternoon, evening and overnight",
          "One schedule: busy in the morning, calm in the evening, dark overnight.",
        ),
      ),
      { h2: "The Photos Are Half of It" },
      {
        p: 'Load an album of past Christmases. The photo frame shows photos taken on this day in earlier years first, pairs portrait photos side by side instead of leaving black bars, and captions each one with how long ago it was. "December 24, 2019 · 7 years ago" is a reliable way to get the kids to stop and look.',
      },
      img(
        fig(
          "/blog/photo-portrait-pair.webp",
          960,
          540,
          "Two portrait family photos side by side with a date caption",
          "Portrait photos pair up, with the date and how long ago.",
        ),
      ),
      { h2: "Free or Household" },
      {
        p: "Countdowns, photos, calendars, a note, the clock and the weather are all on the **Free** plan, so a simple Christmas wall costs nothing. The Christmas and New Year templates, meals and views that change through the day are part of **Household**, along with every other widget.",
      },
    ],
  ),

  guide(
    "digital-photo-frame-for-grandparents",
    "A Digital Photo Frame for Grandparents That the Whole Family Can Add To",
    "Set up a photo frame at Grandma and Grandpa's that fills itself with new pictures from everyone's phones, with nothing for them to manage.",
    "Guides",
    "/templates/photo-frame.png",
    [
      {
        p: "The best gift for grandparents who live a ferry ride or a flight away is often the simplest: a screen in their living room that keeps showing new pictures of the grandkids. The hard part with most frames is everything after the box is opened. Someone has to set up an app, an email address or an account, and then the photos stop coming. This guide sets up a frame that the rest of the family keeps full, and that Grandma never has to touch.",
      },
      { h2: "What You Need" },
      {
        ul: [
          "**A screen with a browser.** An old iPad, an Android or Fire tablet, or a spare monitor with a small computer. A tablet on a stand next to their chair works well.",
          "**Wi-Fi at their house**, and the screen plugged in all the time.",
          "**An Everydaypane account** that you manage. The frame is one of your household's displays, so you can fix anything from your own phone.",
        ],
      },
      { h2: "Make the Frame Look Like a Frame" },
      {
        p: "Start from the **Photo Frame** starter template: one full-screen photos widget with a small clock. Photo frame settings matter more than people expect. **Smart fit** fills the screen unless that would cut off heads, and then shows the whole photo over a soft, blurred copy of itself instead of black bars. **Portrait pairs** puts two phone photos side by side. **Drift** adds a slow, gentle zoom so it doesn't look like a slide show.",
      },
      {
        gallery: [
          fig(
            "/blog/photo-soft-backdrop.webp",
            960,
            540,
            "A tall photo shown whole over a blurred copy of itself",
            "Smart fit: the whole photo over a soft backdrop, never black bars.",
          ),
          fig(
            "/blog/photo-portrait-pair.webp",
            960,
            540,
            "Two portrait photos shown side by side",
            "Portrait pairs: two phone photos, side by side.",
          ),
        ],
      },
      { h2: "Let Everyone Add Photos" },
      {
        p: 'Make a photo library album in **Settings › Photos** and leave **Family can add photos** on. Each display has a phone edit link (the Displays tab shows it, with a QR code). Anyone who opens it can add photos from their phone\'s camera roll, with no account and no app. A photo someone just added comes up next on the frame, captioned "Just added", and whoever added it can take it back with Undo.',
      },
      {
        tip: "Treat the edit link like a house key: share it with your siblings in a family chat, not on social media. If it ever gets out, **New link** in the Displays tab replaces it.",
      },
      { h2: "Pick How Fast Photos Change" },
      {
        p: "Grandparents tend to like a slower frame than kids do. **Time Between Photos** can be 10 seconds, 30 seconds, a minute, five minutes or anything in between. A minute is the default. On the Household plan you can also make the frame the screen saver of a busier wall, so it turns into photos when nobody's using it.",
      },
      img(
        fig(
          "/blog/settings-screen-saver.webp",
          616,
          763,
          "Screen saver settings with Photos chosen and Time Between Photos set to one minute",
          "Time Between Photos, set from your phone.",
          "narrow",
        ),
      ),
      { h2: "Set It Up Once, From Your Phone" },
      {
        p: "Open **everydaypane.com/display/** in the tablet's browser. It shows a QR code and an eight-character code. Scan it with your phone, pick the display and tap Approve. That's the only time anyone needs to touch the screen: it stays signed in, and every change you make later reaches it on its own.",
      },
      img(
        fig(
          "/blog/unlock-qr.webp",
          896,
          1084,
          "Display unlock screen with a QR code and an eight-character code",
          "Scan once to unlock. The frame stays signed in after that.",
          "narrow",
        ),
      ),
      { h2: "Night Mode, So It's Not a Night Light" },
      {
        p: "A bright screen in a dark living room is not a gift. The screen saver can go dark in a night window, say 10 PM to 7 AM, and wake with a tap. Burn-in protection moves the clock a few pixels every minute, so an always-on tablet lasts.",
      },
      img(
        fig(
          "/features/screen-saver.png",
          1920,
          620,
          "The wall in use, then as a photo frame, then dark for the night",
          "In use, photos when idle, dark at night.",
        ),
      ),
      { h2: "Free or Household" },
      {
        p: "Photos, the clock and two displays are on the **Free** plan, so a frame with your own uploads or a Google Photos pick costs nothing if it's your household's only layout. A separate layout for your kitchen and for Grandma's frame, the screen saver and its night window are part of **Household**.",
      },
    ],
  ),

  guide(
    "raspberry-pi-kitchen-dashboard",
    "Build a Raspberry Pi Kitchen Dashboard Without Writing Code",
    "A Raspberry Pi and a monitor make a quiet, always-on wall calendar. Here's the kiosk setup, with the dashboard itself done in a browser.",
    "Guides",
    "/templates/kitchen-glance.png",
    [
      {
        p: "A Raspberry Pi behind a monitor is the classic home-built wall dashboard: silent, cheap to run and small enough to hide. The usual catch is the software. Most Pi dashboard projects mean editing config files, installing modules and fixing them after updates. This guide keeps the Pi part to the minimum (boot straight into a full-screen browser) and does the dashboard itself in Everydaypane, so the layout, calendars and photos are set from your phone.",
      },
      { h2: "What You Need" },
      {
        ul: [
          "**A Raspberry Pi 4 or 5** with its power supply. A Pi 5 is smoother with photos and animated widgets; a Pi 4 with 2 GB or more is fine for most walls.",
          "**A monitor** and the right HDMI cable (micro-HDMI on the Pi 4 and 5). A 1920 × 1080 landscape screen matches the default layout. A touch screen lets the family tick off chores and shopping, but isn't required.",
          "**A microSD card** with Raspberry Pi OS (with desktop), written with Raspberry Pi Imager. Set the Wi-Fi and a user name in the Imager so the first boot is already online.",
          "**A free Everydaypane account.**",
        ],
      },
      { h2: "1. Make the Pi Open the Dashboard on Boot" },
      {
        p: "Recent Raspberry Pi OS uses the labwc desktop. To start Chromium full screen when the Pi boots, add one line to labwc's autostart file. Open a terminal on the Pi and run `mkdir -p ~/.config/labwc` and then edit `~/.config/labwc/autostart` with this line:",
      },
      { p: "`chromium --kiosk --noerrdialogs --disable-infobars https://www.everydaypane.com/display/ &`" },
      {
        p: "On older Raspberry Pi OS releases the browser is called `chromium-browser`, so use that name if `chromium` isn't found. Reboot and the Pi should come up straight into the dashboard's unlock screen.",
      },
      { h2: "2. Stop the Screen From Blanking" },
      {
        p: "Raspberry Pi OS turns the screen off after ten minutes by default, which is the opposite of what a wall wants. Run `sudo raspi-config`, open **Display Options**, and switch **Screen Blanking** off. Everydaypane does its own night-time dimming, so you don't lose anything.",
      },
      { h2: "3. Unlock It With Your Phone" },
      {
        p: "The Pi doesn't need a keyboard for this. The unlock screen shows a QR code and an eight-character code. Scan it with your phone, sign in, pick the display and tap Approve. The Pi stays signed in through reboots and power cuts, until you choose **New link** or delete the display.",
      },
      img(
        fig(
          "/blog/unlock-qr.webp",
          896,
          1084,
          "Display unlock screen with a QR code and an eight-character code",
          "No keyboard needed: approve the Pi from your phone.",
          "narrow",
        ),
      ),
      { h2: "4. Build the Layout From Your Phone or Laptop" },
      {
        p: "Pick a starter template in the household panel's **Views** tab, then drag and resize tiles on a live copy of the wall. Kitchen Glance (above) is a good first one: the clock, the weather, today's schedule, a photo and countdowns. Connect Google Calendar or Microsoft 365 in **Settings › Calendars** and the wall picks it up within seconds.",
      },
      { h2: "Why It Holds Up on a Pi" },
      {
        p: "The wall page isn't a heavy web app. It's plain HTML and one small script, and every call to Google, the weather or the bus company happens on Everydaypane's servers, which send the screen small, trimmed updates. That keeps a Pi cool and responsive for months. If the Wi-Fi drops, the wall keeps showing the last good data with a small \"Offline\" note, and burn-in protection shifts it a few pixels so a monitor left on for years doesn't ghost.",
      },
      img(
        fig(
          "/features/offline-burn-in.png",
          1920,
          960,
          "The wall showing an Offline note with its last good data",
          "Offline mode keeps the last good data on the screen.",
        ),
      ),
      { h2: "At Night" },
      {
        p: "A browser can't switch a monitor's backlight off, so the screen saver's dark mode is a black screen, which on most panels is close enough. Overnight, a night clock view is a softer option: big dim numbers you can read from the hallway.",
      },
      img(
        wall(
          "night-clock",
          "Night Clock template with a large dim clock on a black background",
          "Night Clock: readable from the hallway, dim enough for 3 AM.",
        ),
      ),
      {
        tip: "Comfortable on the command line? `wlr-randr` can switch the HDMI output off and on from a timer, which saves a little power overnight. It's optional, and the dashboard works the same without it.",
      },
      { h2: "Free or Household" },
      {
        p: "**Free** covers a Pi wall with one layout, two calendars, photos, the weather and countdowns. **Household** adds the rest: meals, shopping, chores, transit, smart-home tiles, views that change through the day and the screen saver.",
      },
    ],
  ),

  guide(
    "winter-driving-snow-days-bc",
    "Winter Driving and Snow Days in B.C., on One Screen",
    "Highway cameras, snow on the local mountains, school late starts and weather warnings on the kitchen wall, so the morning decision takes one look.",
    "Guides",
    "/blog/winter-roads-wall.png",
    [
      {
        p: "Winter mornings in the Lower Mainland come with a checklist: is there a snowfall warning, is the school open, what does the Port Mann look like, did the Coquihalla close overnight, and is it worth going up the mountain on Saturday? Each answer lives on a different website. Put them on one screen by the door and the decision takes a glance instead of five tabs.",
      },
      { h2: "What the Winter Wall Shows" },
      {
        ul: [
          "**Weather warnings** from Environment Canada (through Alert Ready) and **DriveBC road events** on a red strip across the top, which a tap opens for the details.",
          "**School status** read from the district's page: open, closed, delayed or late start.",
          "**Highway cameras** from DriveBC: up to four, refreshed every 1 to 15 minutes.",
          "**The snow report** for the local mountains: new snow in the last day, depth and what's coming in the next two days.",
          "**The forecast** and **today's schedule**, so you know what the day needs.",
        ],
      },
      { h2: "Highway Cameras You Pick by Name" },
      {
        p: 'Add a **Highway Cameras** widget and search for the cameras on your drive: "Port Mann", "hwy 1 200 st", "Coquihalla summit". Show them side by side or one at a time. If a camera hasn\'t sent a new picture in 20 minutes the widget says it\'s late, and a camera that\'s switched off says so, so you never read an old picture as today\'s road. The pictures come from the Ministry of Transportation\'s public cameras.',
      },
      {
        gallery: [
          widget(
            "drivebc",
            640,
            480,
            "Highway Cameras widget showing the Port Mann Bridge and Highway 1 at 176 Street side by side",
            "Highway cameras: pick them by name or highway.",
          ),
          widget(
            "snow",
            640,
            480,
            "Snow report widget with new snow and depth for Cypress, Grouse, Seymour and Whistler",
            "Snow report: new snow, depth and the next two days.",
          ),
        ],
      },
      { h2: "Snow on the Mountains" },
      {
        p: "The **Snow Report** covers Cypress, Grouse, Seymour and Whistler by default, with Sasquatch, Manning Park, Mt. Baker and Sun Peaks to choose from. The numbers are a weather-model estimate at mid-mountain, not the resort's own report, and the widget says so. It's best at the question that matters on a Thursday night: is it worth going up this weekend?",
      },
      { h2: "School Late Starts" },
      {
        p: "The **School Status** widget reads the district's own status page every few minutes and shows open, closed, delayed or late start. Langley School District is the default; any district with a public status page can be set in **Settings › School status**. On a late-start morning it says so in the first thing the kids see.",
      },
      { h2: "Rain or Snow Coming In" },
      {
        p: 'The **Rain Radar** shows Environment Canada\'s radar over a map around home, the past few hours and a short forecast, in rain or snow mode. It answers "is that band going to hit before pickup?" better than any forecast number.',
      },
      img(
        fig(
          "/features/widgets/radar.png",
          640,
          640,
          "Rain radar widget over a map of the Lower Mainland",
          "Radar: the last hours and the next ones, around home.",
          "narrow",
        ),
      ),
      { h2: "The Drive Itself" },
      {
        p: 'For the daily commute, the **Commute Time** widget shows drive times with live traffic to up to six places, with a "leave by" time for anywhere you need to be by a set hour. On a snow day, when ten minutes becomes forty, that\'s the number that matters. The **Commute** starter template puts it next to transit departures and the weather.',
      },
      img(
        wall(
          "commute-dash",
          "Commute template with drive times, bus departures and the weather",
          "The Commute template: drive times, the next buses and the weather.",
        ),
      ),
      {
        tip: "Ask the morning brief instead of reading every tile: it reads warnings, school closures and heavy traffic into one sentence, and from 7 PM it reads tomorrow.",
      },
      { h2: "Free or Household" },
      {
        p: "The weather, air quality and the clock are on **Free**. Highway cameras, the snow report, school status, radar, commute times and the alert strip's road events are part of **Household**.",
      },
    ],
  ),

  guide(
    "shared-family-calendar-iphone-android",
    "One Family Calendar When Half of You Use iPhone",
    "iCloud, Google and Outlook calendars on one wall, without moving anyone off the calendar app they already use.",
    "Guides",
    "/templates/calendar-wall.png",
    [
      {
        p: "The most common reason a family calendar fails is that the family doesn't share one. One parent lives in Google Calendar on Android, the other in the iPhone's Calendar app on iCloud, the school sends an iCal link and hockey has its own app. Asking everyone to switch never works. The better fix is a screen that reads all of them and shows them together, one colour per person.",
      },
      { h2: "How Each Calendar Gets on the Wall" },
      {
        ul: [
          "**Google Calendar**: connect the account once in **Settings › Calendars** and pick which calendars to show.",
          "**Microsoft 365 / Outlook**: the same, with a Microsoft sign-in.",
          "**iCloud (iPhone)**: publish the calendar as a public link from Calendar on a Mac or from iCloud.com, then paste that link in **Settings › Calendar links** (Household).",
          "**School, sports and clubs**: paste their iCal or webcal link the same way.",
        ],
      },
      { h2: "Getting the iPhone Calendar Link" },
      {
        p: "Apple doesn't let other apps read iCloud calendars directly, so the way in is a published link. On a Mac, open Calendar, right-click the calendar, choose **Share Calendar…** and tick **Public Calendar**, then copy the address. On iCloud.com, open Calendar, tap the share button next to the calendar and switch on **Public Calendar**. The Calendar app on an iPhone can't show that address, so do this step on a computer once. Settings walks you through it.",
      },
      img(
        fig(
          "/blog/settings-calendar-links.webp",
          1248,
          428,
          "Calendar links settings with steps for publishing an iCloud calendar",
          "Settings › Calendar links, with the iCloud steps.",
        ),
      ),
      {
        tip: "A published calendar can be read by anyone who has its address, so Everydaypane stores the link encrypted, like a password, and never shows it to the wall. Keep it out of group chats.",
      },
      { h2: "One Colour Per Person" },
      {
        p: "Each calendar and each link has its own colour, and the wall uses it on every widget. Pick one colour per person and the week reads at a glance from across the kitchen: blue is Dad, green is the kids, orange is the school. Calendar titles are tidied into title case, and a Google calendar named after an email address can be given a proper name in **Name on the Wall**.",
      },
      {
        gallery: [
          widget(
            "calendarUpNext",
            640,
            480,
            "Up Next widget showing the next event large with the following ones listed",
            "Up Next: what's coming, large enough to read from the sink.",
          ),
          widget(
            "agenda",
            640,
            800,
            "Schedule widget listing today's events in each calendar's colour",
            "Schedule: today, or the next few days.",
          ),
        ],
      },
      { h2: "Events Without a Calendar App" },
      {
        p: "Some things don't belong to anyone's calendar: the plumber on Tuesday, the grandparents visiting, a birthday party for one of the kids. Anyone in the family can add those from their phone at **/family/**, and they show on the wall in the same feed as everything else, marked Family.",
      },
      img(
        fig(
          "/blog/phone-family-calendar.webp",
          716,
          708,
          "Phone adding a family event called Grandma and Grandpa visit",
          "Add a family event from any phone, iPhone or Android.",
          "phone",
        ),
      ),
      { h2: "Pick the Layout That Fits Your Week" },
      {
        p: "Busy weeks read best as a week grid; a quieter family might like the month with today's list beside it. The **Calendar Wall** starter template (above) is the month with the schedule; **Week Planner** is the week with Up Next, today's schedule and countdowns. Both can be rearranged on a live copy of the wall.",
      },
      img(
        wall(
          "week-planner",
          "Week Planner template with a seven-day calendar grid, Up Next, the schedule and countdowns",
          "Week Planner: the whole week, side by side.",
        ),
      ),
      { h2: "Free or Household" },
      {
        p: "**Free** shows two Google or Microsoft 365 calendars, which covers a family that's all on one of them. iCloud and other calendar links, up to 50 calendars, family events from phones, meals and the rest of the widgets are part of **Household**.",
      },
    ],
  ),

  guide(
    "langley-pro-d-days-2026-27",
    "Langley Pro-D Days and School Breaks, 2026–27",
    "Every day off in the Langley School District's 2026–27 calendar in one list, and how to put them on the kitchen wall so nobody's caught out.",
    "Guides",
    "/blog/school-year-wall.png",
    [
      {
        p: "Pro-D days have a way of sneaking up. The district publishes its calendar as a PDF in the spring, it goes on the fridge, and by October it's under a pile of permission forms. Here are the days with no school in the Langley School District (SD35) for 2026–27, from the calendar the Board approved on April 28, 2026. Further down is how to have the wall remind you instead.",
      },
      { h2: "First and Last Day" },
      {
        ul: ["**First day of school:** Tuesday, September 8, 2026.", "**Last day of school:** Tuesday, June 29, 2027."],
      },
      { h2: "Days With No School" },
      {
        ul: [
          "Friday, September 25: School Improvement Day",
          "Wednesday, September 30: National Day for Truth and Reconciliation",
          "Monday, October 12: Thanksgiving",
          "Friday, October 23: Pro-D Day",
          "Wednesday, November 11: Remembrance Day",
          "Friday, November 20: Design & Assessment Day",
          "Friday, December 18 to Monday, January 4: Winter Break (back Tuesday, January 5)",
          "Monday, February 8: Pro-D Day",
          "Monday, February 15: Family Day",
          "Monday, March 15 to Monday, March 29: Spring Break (back Tuesday, March 30)",
          "Monday, April 12: Design & Assessment Day",
          "Friday, May 21: Pro-D Day",
          "Monday, May 24: Victoria Day",
        ],
      },
      { h2: "Early Dismissals" },
      {
        ul: [
          "**Elementary** (conferences): Thursday, December 3 and Wednesday, March 3.",
          "**Middle school** (interviews): October 21 and 22, and April 28 and 29.",
        ],
      },
      {
        tip: "Dates can change and individual schools sometimes add their own. Check the district's calendar at sd35.bc.ca/school-calendar and your school's newsletter before booking anything around them.",
      },
      { h2: "Put the School Year on the Wall" },
      {
        p: "Everydaypane's **School Days** widget knows the school year. In **Settings › School days**, tap the **Langley 2026–27 elementary** or **middle school** preset and every date above is filled in. Add your own (a school's extra Pro-D day, a family trip) to the same list.",
      },
      img(
        fig(
          "/blog/settings-school-days.webp",
          616,
          960,
          "School days settings with the Langley 2026–27 elementary preset filled in",
          "One tap fills in the Langley calendar.",
          "narrow",
        ),
      ),
      {
        p: 'On the wall it says whether today is a school day, a weekend, a Pro-D day or a break (and when school\'s back), warns about early dismissals, adds a "Tomorrow: no school" line the evening before, and lists the next days off with how many days away they are. It can also show a weekly hot-lunch line for schools without an online menu: pizza day, sushi day, hot dog day.',
      },
      {
        gallery: [
          widget(
            "schoolDays",
            480,
            480,
            "School Days widget saying no school tomorrow and listing the next days off",
            "School Days: today, tomorrow and the next days off.",
          ),
          widget(
            "school",
            480,
            320,
            "School Status widget showing schools open",
            "School Status: closed, delayed or late start, from the district's page.",
          ),
        ],
      },
      { h2: "Snow Days Are Different" },
      {
        p: "Pro-D days are on the calendar a year ahead; snow days aren't. The **School Status** widget reads the district's status page every few minutes and shows closed, delayed or late start. The two sit well side by side: one for what's planned, one for what's happening this morning.",
      },
      { h2: "Have a School Calendar Link?" },
      {
        p: "If your school publishes a calendar link (many use Google Calendar or a newsletter app with an iCal address), add it in **Settings › Calendar links** and switch it on under School days. Events titled Pro-D, No School, non-instructional or break are picked up as days off, and early dismissals as early days.",
      },
      { h2: "Free or Household" },
      {
        p: "School Days and School Status are part of **Household**, with meals, chores, the shopping list and the rest of the family widgets. The month calendar, photos and weather are on **Free**.",
      },
    ],
  ),

  guide(
    "home-assistant-wall-panel-family",
    "A Home Assistant Wall Panel the Whole Family Will Actually Use",
    "Lights, locks, cameras and music on a kitchen screen that also shows the calendar and the weather, so it's useful to everyone, not just whoever set up Home Assistant.",
    "Guides",
    "/templates/smart-home.png",
    [
      {
        p: "Most Home Assistant wall panels are built by one person for one person. They're full of switches, graphs and sensor names that make sense to whoever wrote the YAML, and the rest of the family walks past. A panel the family uses leads with what they look for (the time, the weather, today's plans, dinner) and keeps the home controls a tap away, big and plain.",
      },
      { h2: "Lead With the Family, Then the House" },
      {
        p: "The **Smart Home** starter template is a good balance: the clock, the weather and today's schedule for everyone, with who's home, a camera, music, the alert strip and a couple of device tiles for the house. Each Home Assistant tile is one entity, drawn by type: a toggle, a light with brightness, a sensor, a thermostat, a cover, a lock or a button.",
      },
      img(
        blogWall(
          "smart-lights-wall",
          "Kitchen wall with light tiles, colour swatches and the family calendar",
          "Light tiles beside the calendar: the family taps them because they're there anyway.",
        ),
      ),
      { h2: "Safe Enough for a Kitchen" },
      {
        ul: [
          "**Locks lock, never unlock.** Anyone standing in the kitchen can tap the screen, including a visitor or a toddler, so unlocking stays in the Home Assistant app.",
          "**Only entities on a tile can be controlled**, each with a fixed set of actions. The wall never talks to Home Assistant directly; Everydaypane's server does, with your token stored encrypted.",
          "**Who's home is read only.** The presence tile shows who's in and out, from person and device tracker entities, and can't change them.",
        ],
      },
      {
        gallery: [
          widget(
            "presence",
            480,
            320,
            "Who's Home widget showing two people home and two away",
            "Who's Home: read only, never controlled.",
          ),
          widget(
            "haEntity",
            320,
            320,
            "Smart device tile switched on, with a brightness slider",
            "One entity per tile, big enough for a quick tap.",
          ),
        ],
      },
      { h2: "Cameras, the Doorbell and Music" },
      {
        p: "UniFi Protect and other cameras in Home Assistant show as snapshots refreshed on a timer, which is far lighter on a wall tablet than a live stream. When the doorbell rings, every display shows that camera full screen for a few seconds. The **Music** widget drives a Sonos or Spotify media player: what's playing, play and pause, skip, volume and favourites.",
      },
      {
        gallery: [
          widget(
            "camera",
            640,
            480,
            "Camera widget showing a snapshot of the backyard",
            "Camera snapshots on a timer, not a heavy stream.",
          ),
          widget(
            "media",
            640,
            480,
            "Music widget showing the song playing with play, skip and volume controls",
            "Music: now playing, skip and volume.",
          ),
        ],
      },
      { h2: "Motion Wakes the Screen" },
      {
        p: "On Household, the screen saver can turn the wall into a photo frame or go dark when nobody's using it. Add up to five Home Assistant motion sensors and the wall wakes when someone walks into the kitchen, then stays awake while the sensor sees them.",
      },
      { h2: "Reach Home Assistant Without Nabu Casa" },
      {
        p: "Everydaypane reaches Home Assistant through a public address. A free Cloudflare Tunnel, locked with Cloudflare Access so only Everydaypane's service token gets in, does the job without opening a port. The full walkthrough is in [Reach Home Assistant Through a Cloudflare Tunnel](/blog/home-assistant-cloudflare-tunnel/).",
      },
      {
        tip: "No Home Assistant? Nest, ecobee, SmartThings, Govee, Philips Hue and LIFX connect directly from **Settings › Smart home**, and draw the same tiles.",
      },
      { h2: "Free or Household" },
      {
        p: "Home Assistant tiles, cameras, the doorbell pop-up, music, who's home and the screen saver are part of **Household**. The calendar, weather, clock and photos around them are on **Free**.",
      },
    ],
  ),

  guide(
    "radon-indoor-air-bc",
    "Radon and Indoor Air in B.C. Homes: Keep an Eye on It From the Kitchen",
    "Radon, CO₂ and particles from an Airthings monitor on the wall, with a plain green, amber or red and an alert when the basement needs attention.",
    "Guides",
    "/blog/indoor-air-wall.png",
    [
      {
        p: "Radon is a gas you can't see or smell. It comes up from the ground into basements and lower floors, and long-term exposure is the leading cause of lung cancer in people who've never smoked. Parts of B.C., the Interior especially, have high levels, but any house can, and the only way to know is to measure. Health Canada's guideline is 200 becquerels per cubic metre (Bq/m³). A monitor tells you the number. A screen in the kitchen makes sure someone actually looks at it.",
      },
      { h2: "Measure First" },
      {
        p: "Health Canada recommends a long-term test of at least three months, ideally through the fall and winter when windows are shut. You can use a test kit that goes to a lab, or a continuous digital monitor. A monitor is what makes a wall display useful: you see the level change through the seasons, and you'll know if a fix worked.",
      },
      { h2: "Airthings on the Wall" },
      {
        p: "Everydaypane's **Indoor Air** widget reads Airthings monitors through Airthings' official API. Each household makes its own API client on the Airthings dashboard and pastes it in **Settings › Indoor air**. The widget shows radon, CO₂, VOCs, PM2.5 and PM1, humidity and temperature per monitor (pick the readings and the devices), each coloured green, amber or red by Airthings' own bands.",
      },
      {
        gallery: [
          widget(
            "airthings",
            480,
            480,
            "Indoor Air widget with radon, CO2, VOC, PM2.5, humidity and temperature",
            "Indoor Air: each reading in Airthings' own colours.",
          ),
          widget(
            "airQuality",
            480,
            320,
            "Air quality widget showing the AQHI outside",
            "Outside air: the AQHI, the same scale as Environment Canada.",
          ),
        ],
      },
      { h2: "What the Colours Mean" },
      {
        ul: [
          "**Radon:** amber from 100 Bq/m³ and red from 150, below Health Canada's 200 guideline, so you hear about it early.",
          "**CO₂:** amber from 800 ppm and red from 1,000 ppm. High CO₂ means stale air: open a window or run the fan.",
          "**VOCs:** amber from 250 ppb and red from 2,000 ppb, often paint, cleaners or cooking.",
          "**Particles (PM2.5):** amber from 10 µg/m³ and red from 25. Wildfire smoke and searing a steak both get there.",
        ],
      },
      {
        tip: "A single high reading isn't a diagnosis. Radon swings with the weather and the season; it's the long-term average that matters. A mitigation contractor certified under the Canadian National Radon Proficiency Program (C-NRPP) can help if your average is high.",
      },
      { h2: "An Alert When It Matters" },
      {
        p: "Switch on **High radon** or **High CO₂** in the alert settings and the wall shows a note on its alert strip when a monitor goes into the red. Readings more than six hours old never raise one, so a monitor that's lost its connection doesn't cry wolf. Both are off until you switch them on.",
      },
      { h2: "Inside and Outside Together" },
      {
        p: "In wildfire season the question flips: is the air inside better than outside? A **smart notice** compares the two. When the AQHI outside reaches 7 or more and the PM2.5 inside is climbing too, the wall says so, which is the cue to close the windows and run the purifier.",
      },
      img(
        fig(
          "/features/smart-notices.png",
          1280,
          640,
          "Blue smart notices on the wall combining two integrations",
          "Smart notices: blue notes that combine two feeds, like air outside and in.",
        ),
      ),
      { h2: "Free or Household" },
      {
        p: "Outdoor air quality is on **Free**. The Indoor Air widget, radon and CO₂ alerts and smart notices are part of **Household**.",
      },
    ],
  ),

  guide(
    "old-ipad-fire-tablet-wall-calendar",
    "Turn an Old iPad or Fire Tablet Into a Wall Calendar",
    "That tablet in the drawer makes a good family wall calendar. Here's how to keep it awake, locked to one screen and readable from across the room.",
    "Guides",
    "/templates/family-hub-portrait.png",
    [
      {
        p: "Almost every family has one: an iPad that's too slow for games now, or a Fire tablet from a Prime Day sale. It's a perfectly good wall calendar. It has a touch screen, Wi-Fi and a browser, and on a wall mount or a stand by the fridge it can show the family's week, the weather and photos all day. This guide covers the parts that trip people up: keeping it awake, keeping little fingers in the dashboard, and making it readable.",
      },
      { h2: "Will My Tablet Work?" },
      {
        ul: [
          "**iPad:** one that runs iPadOS 16 or newer. Older iPads stuck on iOS 12 or 15 can't run the dashboard's browser code.",
          "**Fire tablet:** any recent Fire HD with the Silk browser. A kiosk browser app from the Appstore makes it nicer (below).",
          "**Android tablet:** anything with an up-to-date Chrome.",
        ],
      },
      { h2: "Portrait or Landscape" },
      {
        p: "Tablets often hang better tall. Everydaypane has portrait layouts on an 8 × 12 grid: **Family Hub** (above), **Kids Routine** and **Playroom**. A landscape tablet can use any of the landscape templates.",
      },
      {
        gallery: [
          wall(
            "kids-routine-portrait",
            "Kids Routine portrait template with chores, dinner, a timer and the schedule",
            "Kids Routine: chores first, then dinner and the day.",
          ),
          wall(
            "playroom-portrait",
            "Playroom portrait template with a clock, the chore chart, a dad joke and the message board",
            "Playroom: chores, a joke and notes.",
          ),
        ],
      },
      { h2: "Keep It Awake" },
      {
        ul: [
          "**iPad:** Settings › Display & Brightness › Auto-Lock › **Never**. Keep it plugged in.",
          "**Fire or Android:** turn on Developer options (tap the build number seven times in Settings › Device Options or About), then switch on **Stay awake** so the screen stays on while charging.",
        ],
      },
      { h2: "Lock It to the Dashboard" },
      {
        p: "A wall tablet should open one thing and stay there. On an iPad, turn on **Guided Access** (Settings › Accessibility › Guided Access), open the dashboard in Safari and triple-click the side or home button to lock it in. On a Fire or Android tablet, a kiosk browser app such as Fully Kiosk Browser opens one address full screen at start-up and keeps it there, and can restart it if it ever closes.",
      },
      { h2: "Unlock the Dashboard With Your Phone" },
      {
        p: "Open **everydaypane.com/display/** on the tablet. It shows a QR code and an eight-character code. Scan it with your phone, pick the display, tap Approve. The tablet stays signed in from then on, and you'll change everything else from your phone.",
      },
      img(
        fig(
          "/blog/unlock-qr.webp",
          896,
          1084,
          "Display unlock screen with a QR code and an eight-character code",
          "Scan, approve, done.",
          "narrow",
        ),
      ),
      { h2: "Make It Readable From Across the Room" },
      {
        p: "A 10-inch screen is small from the sink. Use fewer, bigger tiles: a clock, today's schedule, the weather and one more thing. Every text widget has its own **font size**, from 70 to 150 %, and night mode and dimming in the evening make it easier on the eyes. Kitchen Glance is a good landscape starting point.",
      },
      img(
        wall(
          "kitchen-glance",
          "Kitchen Glance template with a large clock, weather, today's schedule and a photo",
          "Kitchen Glance: a few big tiles beat many small ones on a tablet.",
        ),
      ),
      {
        tip: "Running hot or slow? Turn off glass effects in the theme (they're off by default) and use a photos widget with a longer time between photos. The wall page itself is tiny, so most old tablets keep up.",
      },
      { h2: "Free or Household" },
      {
        p: "A tablet wall with one layout, two calendars, photos and the weather is **Free**. The portrait family templates, chores, timers, the whiteboard and views that change through the day are part of **Household**.",
      },
    ],
  ),

  guide(
    "birthday-anniversary-countdowns",
    "Birthdays and Anniversaries That Celebrate Themselves",
    "A countdown on the kitchen wall that knows how old everyone's turning, and on the day puts their photo up big with a happy birthday.",
    "Guides",
    "/blog/birthday-wall.png",
    [
      {
        p: "Kids ask how many days until their birthday the way adults check the weather: every morning. Grandparents' anniversaries and a cousin's birthday tend to sneak up on everyone else. A countdown on the kitchen wall answers the first and fixes the second. On the day, it does something nicer than a calendar entry: it puts the person's photo up large and says happy birthday.",
      },
      { h2: "Add the Dates Once" },
      {
        p: 'Open the **Countdowns** widget\'s settings and add each date with a name, the date and an emoji. Choose **Birthday** and the wall works out the age they\'re turning ("Sam turns 9 in 12 days"); choose **Anniversary** and it counts the years ("Mom and Dad, 15 years"). Birthdays and anniversaries come back every year on their own. Holidays and one-off events like a trip or a graduation go in the same list.',
      },
      img(
        fig(
          "/features/widgets/countdown.png",
          480,
          480,
          "Countdowns widget saying Happy birthday, Sam with a photo, then an anniversary and Christmas",
          "Close up: the birthday photo large, the anniversary and Christmas waiting below.",
          "narrow",
        ),
      ),
      { h2: "A Photo for Each Date" },
      {
        p: "Each date can carry one photo. It shows as a small circle next to the countdown all year, and on the day it fills the tile: \"Happy birthday, Sam!\" with their picture. That's on by default (**Celebrate on the day**), and can be switched off per widget if you'd rather keep the list.",
      },
      { h2: "Make the Day Feel Like the Day" },
      {
        p: "Pair the countdown with a **Photos** widget showing an album of the birthday kid, and the whole wall becomes theirs for the day. The photo frame puts photos taken on this day in earlier years first, so last year's party comes up on its own.",
      },
      img(
        fig(
          "/features/widgets/photos.png",
          960,
          800,
          "Photos widget showing a living room photo captioned On this day, 2023, 3 years ago",
          'Photos taken on this day come first: "On this day · 2023".',
        ),
      ),
      { h2: "Birthdays Already in Your Calendar?" },
      {
        p: "Keep them there. The calendar widgets and the morning brief show calendar events as usual; countdowns are for the dates you want counted down and celebrated on the wall. The **morning brief** mentions a birthday from your countdowns in its one-line summary of the day.",
      },
      { h2: "Where It Fits on the Wall" },
      {
        p: "Countdowns work in a small corner of almost any layout. The **Kitchen Glance** starter template keeps them next to a photo, the clock, the weather and today's schedule, and **Week Planner** puts them beside the week.",
      },
      img(
        wall(
          "kitchen-glance",
          "Kitchen Glance template with a clock, weather, today's schedule, a photo and countdowns",
          "Kitchen Glance: countdowns in a corner, next to the day.",
        ),
      ),
      { h2: "Free or Household" },
      {
        p: "Countdowns, birthdays, anniversaries and photos are on the **Free** plan. The morning brief, meals and the shopping list are part of **Household**.",
      },
    ],
  ),
];
