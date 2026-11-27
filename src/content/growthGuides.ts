// Guides written for people who haven't heard of Everydaypane yet (Melvin, 2026-11-26: "what other blog posts can we
// create to attract more traffic … high quality, relevant … help with clicks and conversion … visually appealing and
// with several pictures"). Each one answers a search a family makes before choosing a wall calendar, shows real
// screenshots (wall pictures from `npm run templates:previews`, phone and settings shots of the real app) and ends at
// Start Free. Only features that exist go in here; check AGENTS.md before adding a claim.

import type { Block, Figure, Post } from "./posts";

const DATE = "2026-11-26";

function guide(slug: string, title: string, description: string, tag: string, image: string, body: Block[]): Post {
  return { slug, title, description, date: DATE, tag, kind: "guide", image, body: [...body, { cta: true }] };
}

/** A figure block. Sizes are the files' own pixels; marketing.test.ts checks them against the files. */
function fig(src: string, w: number, h: number, alt: string, caption?: string, size?: Figure["size"]): Figure {
  return { src, w, h, alt, ...(caption ? { caption } : {}), ...(size ? { size } : {}) };
}
const img = (f: Figure): Block => ({ img: f });
const wall = (name: string, alt: string, caption?: string) => fig(`/templates/${name}.png`, 1920, 1080, alt, caption);

export const GROWTH_GUIDES: Post[] = [
  guide(
    "skylight-calendar-alternative",
    "A Skylight Calendar Alternative on the Tablet You Already Own",
    "Want a shared family calendar on the wall without buying another gadget? Turn a tablet, old monitor or TV into one in about ten minutes.",
    "Guides",
    "/templates/family-hub.png",
    [
      {
        p: "Digital family calendars like Skylight made one idea popular: put the family's week somewhere everyone walks past, not inside four separate phones. It's a good idea. You just don't need a new appliance for it. If there's a tablet in a drawer, a spare monitor or a TV in the kitchen, you already have the hardware. **Everydaypane** is the software: open it in the screen's browser and it becomes a family wall.",
      },
      { h2: "What a Family Calendar on the Wall Should Do" },
      {
        ul: [
          "Show today and the week at a glance, from the calendars you already use (Google Calendar, Microsoft 365 or any iCal link from school or sports).",
          "Be readable from across the kitchen: big times, big titles, colour per person or calendar.",
          "Change from your phone, so nobody types on the wall.",
          "Look good when nobody's using it: photos, the weather, a countdown to the next birthday.",
        ],
      },
      img(
        fig(
          "/features/widgets/calendarMonth.png",
          1280,
          960,
          "Month calendar widget with colour-coded family events",
          "The month calendar: one colour per calendar, titles that wrap instead of getting cut off.",
        ),
      ),
      { h2: "What You Need" },
      {
        ul: [
          "**A screen with a web browser.** An old iPad, a Fire tablet, an Android tablet, a TV with Chromecast, or a monitor with a small PC. Landscape 1920 × 1080 fits the default layout; portrait tablets have their own templates.",
          "**A power cable that reaches.** A wall dashboard is always on, so plan the cable before you mount it.",
          "**A free Everydaypane account.** Free includes two displays, one view, two calendars, photos, weather and countdowns.",
        ],
      },
      { h2: "Set It Up in About Ten Minutes" },
      {
        ol: [
          "[Start free](/pricing/) and connect Google Calendar (or Microsoft 365) in **Settings › Calendars**.",
          "Open **Views**, tap **Starter Templates** and pick a layout. **Kitchen Glance** and **Calendar Wall** are good first walls.",
          "On the wall screen, open **everydaypane.com** and tap **Connect a Display**. It shows a QR code.",
          "Scan the code with your phone, sign in, pick which display this is and tap **Approve**. The wall unlocks by itself and stays unlocked.",
          "Change anything from your phone afterwards. The wall picks up each change on its own.",
        ],
      },
      {
        gallery: [
          fig(
            "/blog/unlock-qr.webp",
            896,
            1084,
            "Display unlock screen with a QR code and an eight-character code",
            "The wall shows a QR code. Scan it, approve on your phone, done.",
          ),
          fig(
            "/blog/starter-templates.webp",
            1600,
            974,
            "Starter templates gallery in the household panel",
            "Starter templates: pick one, then move and resize anything.",
          ),
        ],
      },
      { h2: "What You Get That a Calendar Frame Doesn't" },
      {
        p: "A calendar frame shows the calendar. A wall dashboard shows whatever the family asks out loud before school: the weather, the bins, the next bus, dinner, the dentist at 4. Everydaypane puts those on the same screen as the calendar, and every tile can be moved, resized and switched off.",
      },
      img(
        wall(
          "kitchen-glance",
          "Kitchen Glance wall: clock, weather, today's schedule, photos and countdowns",
          "Kitchen Glance, a Free starter template: clock, weather, today's schedule, a photo and countdowns.",
        ),
      ),
      {
        p: "When nobody's using it, it can become a photo frame. Photos come from a private library you upload to, Google Photos, Amazon Photos, iCloud shared albums and more. Portrait photos pair up side by side, and the ones taken on this day in earlier years come first.",
      },
      img(
        fig(
          "/blog/photo-portrait-pair.webp",
          960,
          540,
          "Two portrait family photos shown side by side with a caption",
          "Portrait photos pair up instead of leaving black bars.",
        ),
      ),
      { h2: "Where an Appliance Still Wins" },
      {
        p: "To be fair: a dedicated frame comes in a box, already mounted on a stand, with nothing to set up. If you want zero setup and never plan to change the layout, that's worth paying for. If you'd rather reuse a screen, choose your own layout, and add the weather, the bus or the shopping list, a browser dashboard does more for less. There's a longer side-by-side in [Everydaypane vs Skylight](/compare/skylight/).",
      },
      { h2: "Free or Household" },
      {
        p: "Free is a complete calendar wall for one layout on up to two screens. **Household** ($7 a month or $59 a year) adds the family tools (chores, meals, the shopping list, the message board), up to 30 views that change by time of day, the photo frame screen saver, local alerts and smart home controls.",
      },
      {
        tip: "Got a tablet that only does portrait? Pick **Family Hub (Portrait)** or **Kids Routine (Portrait)** from the starter templates.",
      },
    ],
  ),

  guide(
    "best-screen-for-kitchen-wall-dashboard",
    "The Best Screen for a Kitchen Wall Dashboard",
    "Tablet, TV, wall panel or old monitor? How to pick and set up a screen for a family dashboard that's on all day.",
    "Guides",
    "/templates/kitchen-glance.png",
    [
      {
        p: "A family dashboard is only as good as the screen it lives on. It's on all day, someone taps it with wet hands, and it has to be readable from across the room at 7 AM. Here's how to pick one, from the free option in your drawer to a proper wall panel, and how to set each up with **Everydaypane**.",
      },
      { h2: "What Matters More Than Specs" },
      {
        ul: [
          "**Size and distance.** A 10-inch tablet is fine on a counter. On a wall you'll read from the table, 15 inches and up is far more comfortable.",
          "**Orientation.** Landscape 1920 × 1080 matches the default 12 × 8 grid. Portrait screens get an 8 × 12 grid and their own starter templates.",
          "**Touch.** Ticking chores, the shopping list or a timer needs touch. A TV without touch still makes a great read-only wall.",
          "**Power and mounting.** A short, hidden cable to a nearby outlet matters more than a faster processor.",
          "**Brightness at night.** Pick a screen you can dim, or let the dashboard go dark overnight (more on that below).",
        ],
      },
      { h2: "Your Options" },
      { h3: "An Old Tablet (Free)" },
      {
        p: "The cheapest wall there is. Mount it with an adhesive tablet holder, keep it plugged in, and open Everydaypane full screen. On an iPad, Guided Access keeps it on one app. On Android and Fire tablets, a kiosk browser app does the same and can stop the screen from sleeping.",
      },
      img(
        wall(
          "family-hub-portrait",
          "Family Hub portrait layout for a tall tablet",
          "Family Hub (Portrait): made for tablets mounted tall, next to a fridge or in a hallway.",
        ),
      ),
      { h3: "A TV You Already Have" },
      {
        p: "Great for a big, read-only family board in a kitchen or mudroom. Open the display page in the TV's browser, or cast a browser tab with Chromecast. A TV has no touch, so it unlocks with a QR code you scan with your phone.",
      },
      img(
        fig(
          "/blog/unlock-qr.webp",
          896,
          1084,
          "The display unlock screen with a QR code",
          "Screens without a keyboard unlock with a QR code. Scan it, approve on your phone, and it stays unlocked.",
          "narrow",
        ),
      ),
      { h3: "A Touchscreen Wall Panel" },
      {
        p: "The tidy, built-in option: a 15 to 24 inch touchscreen mounted flush, often powered over the network cable. Our own kitchen runs on Ubiquiti's 21-inch UniFi display, and Everydaypane's wall page is built to stay light enough for low-power panels like it: one small script, no heavy framework, nothing animating that doesn't need to.",
      },
      { h3: "A Monitor and a Small PC" },
      {
        p: "A spare monitor with a mini PC or an old laptop behind it works well too, especially with a touch monitor. Set the browser to open Everydaypane full screen at start-up.",
      },
      { h2: "Make It Live Well on a Wall" },
      {
        ul: [
          "**Night mode and dimming.** Each part of the day (morning, afternoon, evening, overnight) can switch view, colours, day or night mode and dimming. It can start at a fixed time, at sunrise or at sunset.",
          "**Go dark at night.** The screen saver can show photos when idle and go fully black overnight. A browser can't switch a panel's backlight off, but black is close.",
          "**Burn-in protection.** The layout shifts by a pixel or two over time so nothing sits in one spot for months.",
          "**Offline mode.** If the Wi-Fi drops, the wall keeps showing the last good data with a small Offline label, instead of going blank.",
        ],
      },
      img(
        fig(
          "/features/time-of-day.png",
          1920,
          1200,
          "Four walls showing morning, afternoon, evening and overnight views",
          "One screen, four parts of the day: each can have its own layout and colours.",
        ),
      ),
      img(
        fig(
          "/features/offline-burn-in.png",
          1920,
          960,
          "A wall dashboard showing saved data with an Offline label",
          "Offline mode keeps the last good data on screen with a small amber label.",
        ),
      ),
      { h2: "Our Pick" },
      {
        p: "Start with what you have. Put an old tablet or TV up this week with the Free plan and see what your family actually looks at. If it sticks, a bigger touchscreen is an easy upgrade later, and your layout comes with you because it lives in your account, not on the device.",
      },
      { tip: "Step-by-step setup for each kind of screen is in [Set Up Everydaypane on a Wall Display](/blog/setup-wall-display/)." },
    ],
  ),

  guide(
    "family-command-centre-ideas",
    "Family Command Centre Ideas for a Busy Kitchen",
    "Nine family command centre ideas that run on one screen: calendars, chores, meals, shopping, notes, the commute and photos.",
    "Ideas",
    "/templates/kitchen-command.png",
    [
      {
        p: "A family command centre is the spot where the week gets organised: the calendar, the chore chart, the meal plan, the note that says the permission slip is due. Most are corkboards and whiteboards that are out of date by Wednesday. A screen fixes that. It updates itself from the calendars and phones you already use, and everyone sees the same thing. Here are nine ideas, each one a real **Everydaypane** layout you can start from.",
      },
      { h2: "1. The Calendar Wall" },
      {
        p: "The month at a glance with this week's details beside it. Each calendar keeps its own colour, so it's easy to see whose day is busy. A Free starter template.",
      },
      { h2: "2. The Kitchen Command Post" },
      {
        p: "Everything a busy kitchen asks about: today's meals, the shopping list, kitchen timers, garbage day and the family's notes. Shopping items tick off with a tap and the list updates on everyone's phone.",
      },
      { h2: "3. The Kids' Routine Board" },
      {
        p: "A chore chart split into morning, afternoon and evening, with stars, a weekly goal and rewards the kids can save up for. Kids tick chores off on the wall or on their own phone page.",
      },
      img(
        wall(
          "kids-routine",
          "Kids Routine template with three children's chore columns, stars and rewards",
          "Kids Routine: each child's chores, stars and rewards, plus meals and notes.",
        ),
      ),
      { h2: "4. The Meal Plan and Shopping Station" },
      {
        p: "The week's breakfasts, lunches and dinners next to the shopping list, grouped by aisle. Plan from any phone. Repeating meals like taco Tuesday fill themselves in.",
      },
      img(
        fig(
          "/blog/meals-wall.png",
          1920,
          1080,
          "A wall with the week's meals, an aisle-grouped shopping list, notes and a QR code",
          "Meals for the week, shopping by aisle, and a QR code that lets anyone in the kitchen edit from their phone.",
        ),
      ),
      { h2: "5. The Family Message Board" },
      {
        p: "Notes from phones show on the wall in the sender's colour. Turn on **Message Pop-Ups** and each new note also appears in the corner until someone taps Dismiss, so “we're out of milk” doesn't get missed.",
      },
      img(
        fig(
          "/blog/message-popups.webp",
          1920,
          1080,
          "Three family notes popping up in the corner of a wall dashboard",
          "Message pop-ups: new notes stack in the corner until someone dismisses them.",
        ),
      ),
      { h2: "6. The Morning Launch Pad" },
      {
        p: "For the 20 minutes before everyone leaves: a big clock, the weather, and a **Morning Brief** that reads the day in one sentence. Rain at 3, swim at 5, bins out tonight. [How the morning brief works](/blog/morning-brief-family-routine/).",
      },
      { h2: "7. The Commute Corner" },
      {
        p: "Live drive times with a “leave by” time, the next buses from your stops, and highway cameras. Good near the front door.",
      },
      img(
        wall(
          "commute-dash",
          "Commute Dash template with drive times, transit departures and weather",
          "Commute Dash: drive times, transit and the weather at the door.",
        ),
      ),
      { h2: "8. The Photo Frame for Quiet Hours" },
      {
        p: "When nobody's touched the screen for a while, the wall becomes a photo frame and the dashboard comes back with one tap. Family members can add photos from their phones, and new ones show up next.",
      },
      img(
        wall(
          "photo-frame",
          "Photo Frame template with a full-screen family photo, clock and date",
          "Photo Frame: full-screen photos with a small clock and date.",
        ),
      ),
      { h2: "9. The Two-Time-Zone Family" },
      {
        p: "Grandparents in another province or a parent who travels? Two clocks side by side, with the weather and the day ahead.",
      },
      { h2: "Mix and Match" },
      {
        p: "Every one of these starts from a template and ends up yours. Drag tiles, resize them from any corner, set each tile's background and font size, and schedule different layouts for morning, afternoon, evening and overnight. All of it is edited from your phone while the wall shows a live preview.",
      },
      {
        tip: "Calendar Wall, Kitchen Glance, Simple Day, Week Planner, Two Cities, Photo Frame and Night Clock are Free. Chores, meals, shopping, the message board and the morning brief are part of [Household](/pricing/).",
      },
    ],
  ),

  guide(
    "morning-brief-family-routine",
    "A Morning Brief That Reads the Day for Your Family",
    "One sentence on the kitchen wall that sums up the day: rain, appointments, bins, ferry delays and dinner. How it works and how to set it up.",
    "Family",
    "/templates/morning-brief.png",
    [
      {
        p: "Every family has the same morning conversation. Is it going to rain? Who has what after school? Is it garbage day? What's for dinner? The answers are spread across a weather app, three calendars, the city's pickup schedule and a meal plan on the fridge. The **Morning Brief** on Everydaypane reads all of them and says the day in one line, right on the kitchen wall.",
      },
      img(
        fig(
          "/features/widgets/brief.png",
          960,
          320,
          "Morning brief tile reading rain at 6 PM, swim lessons, Grandma for dinner, bins out tonight and tacos for dinner",
          "“Rain at 6 PM, Swim lessons at 5 PM, Grandma for dinner at 6:30 PM, recycling and organics out tonight, Tacos + rice for dinner.”",
        ),
      ),
      { h2: "What It Reads" },
      {
        p: "The brief uses what your wall already knows. No extra accounts, no new apps. Each part only speaks when it has something to say:",
      },
      {
        ul: [
          "**Emergency alerts** that would go on the red alert strip lead the brief.",
          "**Rain or snow**, with the hour it starts (or “until” when it's already coming down).",
          "**Calendar events still ahead today**, all-day ones first, plus birthdays and holidays from your countdowns.",
          "**School closures** from the district's status page.",
          "**Bins**: “out tonight” the evening before and “pickup today” in the morning.",
          "**Ferry delays and cancellations** on the routes you follow, and **heavy traffic** on your commute.",
          "**Dinner** from the meal plan.",
        ],
      },
      { h2: "Sentence or List" },
      {
        p: "Pick a single sentence for a small tile or a list for a bigger one. The text shrinks to fit the tile, so it never cuts off.",
      },
      img(
        fig(
          "/blog/morning-brief-list.png",
          960,
          320,
          "Morning brief as a list with icons",
          "The list layout, with a little extra detail on each line.",
          "narrow",
        ),
      ),
      { h2: "From 7 PM, It Reads Tomorrow" },
      {
        p: "In the evening, today is mostly done. From 7 PM the brief switches to tomorrow, so the wall tells you about the early swim practice and the recycling while there's still time to do something about it. You can turn this off if you'd rather it stay on today.",
      },
      img(
        fig(
          "/features/time-of-day.png",
          1920,
          1200,
          "Morning, afternoon, evening and overnight walls",
          "Pair the brief with a time-of-day schedule: a busy morning wall, a calm evening one.",
        ),
      ),
      { h2: "Set It Up" },
      {
        ol: [
          "Connect your calendars in **Settings › Calendars**, and set your garbage zone, commute and meal plan if you use them. The brief only mentions what's set up.",
          "In **Views**, tap **Add Widget** and choose **Morning Brief**. A wide, short tile across the top works well.",
          "Tap the tile to open its settings: pick the sources, sentence or list, and how many events to name.",
          "Tap **Publish to Wall**.",
        ],
      },
      { h2: "Good Places for It" },
      {
        ul: [
          "Across the top of a kitchen wall, above the calendar and the weather.",
          "On a small tablet by the front door, next to the commute and the bus.",
          "In the evening view, as a heads-up for tomorrow.",
        ],
      },
      img(
        fig(
          "/blog/morning-brief-wall.png",
          1920,
          1080,
          "A full kitchen wall with the morning brief across the top",
          "A full morning wall: the brief up top, with the weather, today's schedule, bins, meals and a birthday underneath.",
        ),
      ),
      {
        tip: "The Morning Brief is part of [Household](/pricing/), along with the meal plan, time-of-day views and local alerts it reads from.",
      },
    ],
  ),

  guide(
    "digital-photo-frame-vs-wall-dashboard",
    "Digital Photo Frame vs Wall Dashboard: Why Not Both?",
    "A screen that shows the family's week when you need it and your photos the rest of the time. What a good photo frame needs and how to set one up.",
    "Family",
    "/templates/photo-frame.png",
    [
      {
        p: "Digital photo frames are lovely and do exactly one thing. Family wall calendars are useful and usually look like spreadsheets. Most kitchens only have room for one screen, so why choose? **Everydaypane** is a family dashboard when someone walks up to it and a photo frame the rest of the time.",
      },
      { h2: "What Makes a Photo Frame Good" },
      {
        p: "The hard part of a photo frame isn't showing photos. It's showing *your* photos well, every day, without anyone curating them. Everydaypane's photo frame does a few things for that:",
      },
      {
        ul: [
          "**Smart fit.** A photo fills the frame unless that would crop too much. Then it's shown whole, over a soft, blurred copy of itself, instead of black bars.",
          "**Portrait pairs.** Two tall photos sit side by side in a wide frame, the way you'd arrange prints.",
          "**On this day.** Photos taken on today's date in earlier years come first, captioned “On this day · 2019”.",
          "**Captions that mean something.** “June 2, 2024 · 2 years ago”, from the date the photo was taken.",
          "**Slow drift.** A gentle zoom keeps it feeling alive without being distracting (and it stops for anyone who prefers reduced motion).",
        ],
      },
      {
        gallery: [
          fig("/blog/photo-portrait-pair.webp", 960, 540, "Two portrait photos side by side with a date caption", "Two portraits, paired."),
          fig(
            "/blog/photo-soft-backdrop.webp",
            960,
            540,
            "A photo shown whole over a soft blurred copy of itself",
            "A tall photo in a wide frame, shown whole over a soft backdrop.",
          ),
        ],
      },
      { h2: "Where the Photos Come From" },
      {
        p: "Use the albums you already have: Google Photos, Amazon Photos shared albums, iCloud shared albums, OneDrive, Dropbox, Immich, Flickr and more. Or upload to a private photo library that only your household can see.",
      },
      {
        p: "**Family can add photos too.** Turn on **Family Can Add Photos** for a library album, and anyone in the family can send a picture from their phone. New photos show up next on the wall, captioned “Just added”, so grandparents visiting for the weekend see the trip photos that evening.",
      },
      { h2: "When Someone Walks Up, It's a Dashboard" },
      {
        p: "Set the **screen saver** to show a view you built, like the Photo Frame starter template. After the minutes you choose without a touch, the wall becomes the photo frame. One tap brings back the calendar, weather and the rest, and that tap never presses anything by accident.",
      },
      img(
        fig(
          "/features/screen-saver.png",
          1920,
          620,
          "A kitchen dashboard and the photo frame it turns into after ten minutes idle",
          "In use, then a photo frame after ten minutes idle. A tap wakes it.",
        ),
      ),
      {
        p: "You can also keep a few widgets on top of the photos, like a clock, the weather and the next event, with readable panels behind them.",
      },
      img(
        fig(
          "/features/widgets-on-photos.png",
          1920,
          960,
          "A full-screen photo with a clock, date, weather and next event on top",
          "Widgets on top of photos: the photo is the backdrop, the day is still there.",
        ),
      ),
      { h2: "Set It Up" },
      {
        ol: [
          "In **Settings › Photos**, add an album: connect Google Photos, paste an iCloud or Amazon shared album link, or create a library and upload.",
          "In **Views**, add a view from the **Photo Frame** starter template.",
          "Tap **Edit View** and turn on **Show When Nobody's Using the Screen**.",
          "In **Settings › Screen Saver**, pick the minutes without a touch and **Time Between Photos** (one minute is a calm default).",
          "Optional: turn on **Go Dark at Night** so the frame isn't lighting up an empty kitchen at 2 AM.",
        ],
      },
      {
        tip: "Photos are part of Free (one view, up to two screens). The photo frame screen saver is part of [Household](/pricing/). There's more detail in [Turn the Wall Into a Photo Frame](/blog/photo-frame-screen-saver/).",
      },
    ],
  ),

  guide(
    "chore-chart-with-rewards",
    "A Kids' Chore Chart With Stars and Rewards (That Updates Itself)",
    "Printable chore charts get ignored by week two. A chore chart on the wall with stars, rewards and a phone page for each kid keeps going.",
    "Family",
    "/templates/kids-routine.png",
    [
      {
        p: "Printable chore charts work for about a week. Then the sticker sheet runs out, someone's chores change, and the chart on the fridge stops matching real life. A chore chart on a screen keeps itself current: the right chores show up on the right days, turns rotate fairly, and stars add up without anyone counting.",
      },
      img(
        fig(
          "/features/widgets/chores.png",
          960,
          640,
          "Chore chart widget with each child's chores, stars and progress",
          "The chore chart on the wall: each child's chores for today, ticked off with a tap.",
        ),
      ),
      { h2: "How It Works" },
      {
        ul: [
          "**Chores by time of day.** Morning, afternoon, evening or anytime, so “make bed” isn't sitting next to “clear dishes” at 7 AM.",
          "**The right days.** Each chore runs on the weekdays you pick: bins on Tuesdays, laundry on Wednesdays and Saturdays.",
          "**Fair turns.** A shared chore can go to everyone, rotate each time it's due, or rotate a week at a time.",
          "**Stars.** Each chore is worth one to five stars. The wall counts each child's stars for the week, with a progress bar towards a weekly goal.",
          "**Rewards.** Set what stars buy: 30 minutes of screen time, picking Friday's movie, an ice cream run. Kids can see what they're saving for.",
          "**A parent PIN.** Unticking a chore and spending stars can ask for a PIN, so nobody “un-does” the dishes.",
        ],
      },
      { h2: "On the Wall, or on Their Own Phone" },
      {
        p: "Kids tap their chores on the wall as they do them. Older kids with a phone or tablet get their own page: they pick their name and see just their chores for today, grouped by morning, afternoon and evening, with their rewards underneath.",
      },
      {
        gallery: [
          fig(
            "/blog/phone-kids-chores.webp",
            780,
            1688,
            "A child's chore page on a phone with morning, afternoon and evening chores",
            "Maya's page: three done, two to go.",
          ),
          fig(
            "/templates/kids-routine-portrait.png",
            1920,
            1080,
            "Kids Routine portrait layout",
            "Kids Routine (Portrait), for a tablet mounted tall in the hallway.",
          ),
        ],
      },
      { h2: "Three Layouts" },
      {
        p: "Show the chart as **columns** (one per child), **by period** (morning, afternoon, evening), or as **progress rings** for a quick “who's done” at a glance.",
      },
      { h2: "Set It Up" },
      {
        ol: [
          "In **Settings › Chores**, add each child with a name, an emoji, a colour and an optional weekly star goal.",
          "Add chores: name, emoji, stars, days, time of day, who does it and how turns rotate.",
          "Add a few rewards and their star cost. Set a PIN if you want one.",
          "In **Views**, start from **Kids Routine**, or add a **Chore Chart** tile to any view. Turn on **Tap to Tick Off** in its settings.",
          "Open **Family › Kids Chores** on a child's phone, or scan the kitchen QR code, so they have their own page.",
        ],
      },
      { h2: "Tips From Families Who Stuck With It" },
      {
        ul: [
          "Start with three chores per child. Add more once the habit is there.",
          "Make the first reward cheap, so the first week ends with a win.",
          "Put the chart where the chores happen: by the kitchen for dishes, by the door for backpacks.",
        ],
      },
      {
        tip: "The chore chart is part of [Household](/pricing/). It's separate from Google Tasks on purpose: kids get stars, not a to-do list.",
      },
    ],
  ),

  guide(
    "family-meal-planning-and-shopping-list",
    "Meal Planning the Whole Family Actually Sees",
    "A weekly meal plan on the kitchen wall, repeating meals that fill themselves in, and a shared shopping list grouped by aisle.",
    "Family",
    "/templates/kitchen-command.png",
    [
      {
        p: "A meal plan only works if people see it. On an app, the person who planned it is the only one who looks. On the kitchen wall, everyone knows what's for dinner, the kids stop asking, and whoever gets home first can start it. Here's how meal planning and the shopping list work on **Everydaypane**.",
      },
      { h2: "Plan the Week From Any Phone" },
      {
        p: "Breakfast, lunch and dinner for each day, typed on a phone. Each meal saves as soon as you leave the box, and recent meals come back as suggestions so you're not typing “spaghetti” every week.",
      },
      img(
        fig(
          "/blog/phone-meal-plan.webp",
          780,
          1640,
          "The meal planner on a phone with today and tomorrow's meals",
          "The meal plan on a phone. It saves as you go.",
          "phone",
        ),
      ),
      { h2: "Repeating Meals Fill Themselves In" },
      {
        p: "Cereal every Monday, eggs every Tuesday, pizza every other Friday. Set a meal to repeat on chosen weekdays or every few days, and future weeks fill in by themselves. Skipping one day leaves the rest of the series alone.",
      },
      { h2: "On the Wall" },
      {
        p: "The meals tile shows today (or the whole week) with the next meal highlighted. From 8 PM it shows tomorrow, so breakfast is on the wall before bed.",
      },
      img(
        fig(
          "/blog/meals-wall.png",
          1920,
          1080,
          "Wall with the week's meals, an aisle-grouped shopping list, family notes and a phone edit QR code",
          "The week's meals, the shopping list grouped by aisle, notes, and a QR code for editing from a phone.",
        ),
      ),
      { h2: "A Shopping List Grouped by Aisle" },
      {
        p: "Anyone in the family adds groceries from their phone, and the wall shows them grouped like the store: produce, bakery, dairy and eggs, meat, frozen, pantry and household. You don't pick the aisle; it's guessed from the words. If it guesses wrong, move it once on your phone and it remembers.",
      },
      {
        ul: [
          "**Running low.** Mark an item **Low** when there's still some left. It gets a small amber tag, so “grab it if you're there” is different from “we're out”.",
          "**Tick off on the wall.** Turn on tap to tick off, and the list updates on everyone's phone in a second or two.",
          "**Add from the wall.** Optionally let people add items right on the screen, with a Low chip.",
          "**Add from this week's meals.** One button copies the week's planned meals onto the list.",
        ],
      },
      img(fig("/features/widgets/shopping.png", 640, 640, "Shopping list widget", "The shopping list tile on the wall.", "narrow")),
      { h2: "No Sign-In Needed in the Kitchen" },
      {
        p: "Add the **Phone Edit QR** tile to the wall. Anyone in the kitchen (a grandparent, the babysitter) can scan it and add to the meal plan, the shopping list or the message board from their own phone, without an account.",
      },
      img(
        fig(
          "/blog/message-popups.webp",
          1920,
          1080,
          "Family notes popping up on the wall: can someone grab more milk?",
          "With message pop-ups on, “Can someone grab more milk?” shows up in the corner until someone dismisses it.",
        ),
      ),
      { h2: "Set It Up" },
      {
        ol: [
          "Open **Family › Meals** on your phone and plan a few days. Set a repeat on anything that happens every week.",
          "Open **Family › Shopping** and add what you need.",
          "In **Views**, start from **Kitchen Command**, or add **Meals** and **Shopping List** tiles to your view. Turn on **Group by Aisle** and **Tap to Tick Off**.",
          "Add a **Phone Edit QR** tile so everyone in the kitchen can help.",
        ],
      },
      { tip: "Meals, the shopping list and the message board are part of [Household](/pricing/)." },
    ],
  ),

  guide(
    "wildfire-season-dashboard-bc",
    "A Wildfire Season Dashboard for B.C. Homes",
    "Fires near home, evacuation orders, smoky air and rising rivers, on one screen in the kitchen. Built from BC Wildfire Service and EmergencyInfoBC data.",
    "Alerts",
    "/blog/wildfire-season-wall.png",
    [
      {
        p: "Every summer, B.C. families end up with the same five tabs open: the wildfire map, EmergencyInfoBC, the air quality index, the forecast and a news site. **Everydaypane** puts the parts that matter for your home on one screen, so the whole family can see at a glance whether anything nearby has changed.",
      },
      { h2: "Fires Near Home" },
      {
        p: "The **Wildfires** tile draws active fires around your home on a map, from the BC Wildfire Service's own public data. Colours match their map: red for new or out of control, amber for being held, green for under control, with a ring around fires of note. Burned areas and evacuation areas are drawn too, and the nearest fires are listed with their distance, size and stage of control.",
      },
      img(
        fig(
          "/features/widgets/wildfires.png",
          640,
          640,
          "Wildfire map tile with fires coloured by stage of control and the nearest fires listed",
          "The nearest fires, their size and their stage of control.",
          "narrow",
        ),
      ),
      { h2: "Evacuation Orders on the Alert Strip" },
      {
        p: "Evacuation orders and alerts from EmergencyInfoBC go on the red alert strip at the top of the screen, graded by how close they are. An order covering your home is the most urgent alert the wall can show; one nearby is a heads-up. Tap the strip for the details. Severe ones come back after a few hours even if someone dismissed them.",
      },
      { h2: "Smoke and Air Quality" },
      {
        p: "The **Air Quality** tile shows the AQHI (or the U.S. AQI) and PM2.5, coloured from low to very high risk. Special air quality statements arrive on the alert strip with the other Environment Canada warnings. If you have an Airthings monitor, a smart notice can tell you when the air outside is bad and the air inside is getting worse too.",
      },
      {
        gallery: [
          fig("/features/widgets/airQuality.png", 480, 320, "Air quality tile showing AQHI", "Air quality (AQHI) and PM2.5."),
          fig("/features/widgets/alerts.png", 640, 320, "Alerts tile listing current warnings", "Every current alert in one tile."),
        ],
      },
      { h2: "The Rest of the Season" },
      {
        ul: [
          "**Rain radar** from Environment Canada, with the next few hours of forecast. Useful for thunderstorms and lightning season too.",
          "**River levels** for the Fraser, the Salmon, the Nicomekl or any gauge by number, with rising or falling and the change over the day. Handy for the spring freshet and autumn atmospheric rivers.",
          "**BC Hydro outages** near home on the same alert strip.",
          "**Highway cameras** from DriveBC, for checking the Coquihalla before a trip.",
          "**Email alerts** for strip-worthy alerts, so the family hears about an evacuation order even when nobody's in the kitchen.",
        ],
      },
      img(
        fig(
          "/features/widgets/rivers.png",
          480,
          480,
          "River levels tile with rising and falling gauges",
          "River levels: rising, falling or steady, with the day's line.",
          "narrow",
        ),
      ),
      { h2: "Set It Up" },
      {
        ol: [
          "In **Settings › Location**, set your home. B.C. homes get the B.C. sources automatically.",
          "In **Settings › Emergency Alerts**, check that evacuation orders, Environment Canada warnings and BC Hydro outages are on. Set how close an evacuation area has to be (10 km by default). Turn on email if you want it.",
          "Add **Wildfires**, **Air Quality**, **Rain Radar** and **River Levels** tiles to a view. A summer view on the time-of-day schedule keeps them out of the way in winter.",
        ],
      },
      {
        tip: "Everydaypane shows official data as it's published, but it isn't an emergency service. Always follow instructions from local authorities and EmergencyInfoBC. Alerts and these widgets are part of [Household](/pricing/).",
      },
    ],
  ),

  guide(
    "family-dashboard-calgary-toronto-seattle",
    "A Family Wall Dashboard for Calgary, Toronto, Seattle and Beyond",
    "Everydaypane picks local alerts, power outages and transit from your location. What you get in Alberta, Ontario, Québec, Nova Scotia and Washington.",
    "Guides",
    "/features/regional-packs.png",
    [
      {
        p: "Everydaypane started on a kitchen wall in Langley, B.C., which is why it knows about BC Ferries and the Township's garbage day. But the parts most families care about (calendars, weather, photos, chores, meals) work anywhere. And for the local parts, your location now picks a **regional pack**: the alerts, power outages and transit that actually apply where you live.",
      },
      { h2: "What Each Region Gets" },
      { h3: "Everywhere in Canada" },
      {
        p: "Alert Ready public alerts, Environment Canada weather warnings and Earthquakes Canada, on the red alert strip at the top of the screen.",
      },
      { h3: "Calgary, Edmonton and Alberta" },
      {
        p: "511 Alberta road closures and major events near home. **Calgary Transit** or **Edmonton Transit** departures from the stops you pick. In Edmonton, **EPCOR** power outages near home.",
      },
      { h3: "Toronto and Ontario" },
      {
        p: "Ontario 511 road closures and major events near home, and live **TTC** departures in Toronto.",
      },
      img(
        fig(
          "/blog/region-toronto.webp",
          1148,
          388,
          "Settings showing the Toronto region with Ontario 511 and TTC departures",
          "Settings › Location shows exactly what your region reads.",
        ),
      ),
      { h3: "Québec" },
      { p: "**Hydro-Québec** power outages near home." },
      { h3: "Halifax" },
      { p: "Live **Halifax Transit** departures." },
      { h3: "Seattle, King County and the U.S." },
      {
        p: "National Weather Service watches and warnings and USGS earthquakes everywhere in the U.S., plus **King County Metro** departures around Seattle.",
      },
      img(
        fig(
          "/blog/region-seattle.webp",
          1148,
          356,
          "Settings showing the Seattle and King County region",
          "Seattle and King County: NWS, USGS and King County Metro.",
        ),
      ),
      { h3: "Metro Vancouver, the Fraser Valley and Victoria" },
      {
        p: "The full B.C. set: BC Hydro outages, DriveBC road events and cameras, EmergencyInfoBC evacuations, wildfires, TransLink or BC Transit, BC Ferries, border wait times and Township of Langley garbage day.",
      },
      img(
        fig(
          "/blog/region-langley.webp",
          1148,
          452,
          "Settings showing the Metro Vancouver region and its local sources",
          "Metro Vancouver and the Fraser Valley get the most local sources.",
        ),
      ),
      { h2: "Transit on the Wall" },
      {
        p: "The **Transit Departures** tile shows the next buses and trains from up to six stops, with live times and how late each one is. It counts down between updates, and you can hide routes you don't take or departures you can't walk to in time.",
      },
      img(
        fig(
          "/features/widgets/transit.png",
          800,
          480,
          "Transit departures tile with live bus times",
          "Live departures from the stops you pick.",
        ),
      ),
      { h2: "What Works Everywhere" },
      {
        ul: [
          "Google Calendar, Microsoft 365 and iCal calendars, in a schedule, a month grid, a week or “up next”.",
          "Weather (current conditions, hourly and seven days), air quality, sunrise and sunset, the moon and the aurora forecast.",
          "Photos and the photo frame screen saver.",
          "Chores, meals, the shopping list, the message board and the whiteboard.",
          "Sports scores, commute times with live traffic, package tracking and smart home controls.",
        ],
      },
      { h2: "Set It Up" },
      {
        ol: [
          "In **Settings › Location**, find your town. The region is picked from it.",
          "Check the **Region** box below it to see which local sources you get. If you live right on a border, pick your region by hand.",
          "Add a **Transit Departures** tile and search for your stops.",
        ],
      },
      {
        tip: "Don't see your city? Weather, calendars and everything else still work. Tell us on the [contact page](/contact/) which local feeds you'd like next.",
      },
    ],
  ),

  guide(
    "smart-lights-on-the-kitchen-wall",
    "Smart Lights on the Kitchen Wall: Hue, LIFX and Govee Without Home Assistant",
    "Control Philips Hue, LIFX and Govee lights from a family wall dashboard, signed in directly, with colours, brightness and scenes.",
    "Smart Home",
    "/blog/smart-lights-wall.png",
    [
      {
        p: "Smart lights are great until someone has to find the right app. A wall dashboard fixes that: the living room, the TV strip and the porch light are one tap away for everyone in the house, including guests and kids without the app. **Everydaypane** connects to Philips Hue, LIFX and Govee directly, with no Home Assistant server or hub to run at home.",
      },
      { h2: "What Each Light Tile Does" },
      {
        ul: [
          "**On and off** with a tap anywhere on the tile.",
          "**Brightness** with a slider.",
          "**Colour swatches** while the light is on. The tile takes on the light's colour, so you can see what's on from across the room.",
          "**Scenes** for Govee lights: Movie Night, Sunset and whatever else your lights offer.",
        ],
      },
      { h2: "Connect Your Lights" },
      { h3: "Philips Hue" },
      {
        p: "In **Settings › Smart Home**, tap **Connect Philips Hue** and sign in with your Hue account. Press the button on your Hue bridge once when asked. That's it: your lights show up to add as tiles.",
      },
      { h3: "LIFX" },
      {
        p: "Make a personal access token in your LIFX account and paste it in **Settings › Smart Home**. Everydaypane checks it with LIFX before saving it, encrypted.",
      },
      { h3: "Govee" },
      {
        p: "Request an API key in the Govee Home app and paste it in **Settings › Smart Home**. Your Govee lights, colours and scenes come with it.",
      },
      { h2: "More Than Lights" },
      {
        p: "The same Smart Device tile works with **Google Nest** and **ecobee** thermostats, **SmartThings** devices, and anything in **Home Assistant** if you run it. Around them you can add:",
      },
      {
        ul: [
          "**Music** from Spotify, Sonos or Home Assistant: now playing, play and pause, skip and volume.",
          "**Who's home** from Home Assistant.",
          "**Camera snapshots** and a full-screen doorbell pop-up when someone rings.",
          "**Power stations** from EcoFlow, **indoor air** from Airthings, **sprinklers** from Rachio and **washer and dryer** status from LG and Samsung.",
        ],
      },
      {
        gallery: [
          fig(
            "/features/widgets/media.png",
            640,
            480,
            "Music tile showing what's playing with controls",
            "Music: Spotify, Sonos or Home Assistant.",
          ),
          fig("/features/widgets/ecoflow.png", 640, 480, "EcoFlow power station tile with battery and solar", "EcoFlow battery and solar."),
        ],
      },
      { h2: "Smart Notices That Combine Them" },
      {
        p: "Some of the most useful things happen between devices. **Smart notices** are small blue notes on the alert strip that join two sources: the sprinklers are due in frost, the backup battery during a power outage, bad air outside with indoor particles rising, laundry left in the machine.",
      },
      img(
        fig(
          "/features/smart-notices.png",
          1280,
          640,
          "A blue smart notice on the wall about sprinklers due in frost",
          "A smart notice: sprinklers due at 5 AM with frost in the forecast.",
        ),
      ),
      { h2: "Safe for a Shared Screen" },
      {
        ul: [
          "Only the devices you put on a tile can be controlled from the wall. Nothing else in your account is exposed.",
          "Locks can be locked from the wall, never unlocked, because anyone in the kitchen can tap the screen.",
          "Keys and tokens are stored encrypted on the server and never sent to the wall or your browser.",
        ],
      },
      img(wall("smart-home", "Smart Home starter template", "The Smart Home starter template is a good place to begin.")),
      {
        tip: "Smart home controls are part of [Household](/pricing/). Prefer Home Assistant? See [Home Assistant Through a Free Cloudflare Tunnel](/blog/home-assistant-cloudflare-tunnel/).",
      },
    ],
  ),
];
