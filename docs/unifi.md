# UniFi network (internet health)

Household only. The **UniFi network** widget shows whether the internet is up, how quick the line is, and how long it
was down in the last 24 hours, as your UniFi gateway (a Dream Machine, Cloud Gateway, UXG and so on) reports it to
UniFi's cloud. It reads Ubiquiti's official **Site Manager API** (`api.ui.com`): nothing runs at home, no Home
Assistant, no relay.

It complements the **Internet** ping widget: that one measures from the wall screen's browser; this one is the router's
own view of the line, with the ISP's latency, packet loss and outages.

## What it shows

- **Online, Slow or Down**, with the latest five-minute latency and packet loss. Down means the gateway has dropped off
  UniFi's cloud or its WAN was down in the latest reading. Slow is the widget's own line (100 ms by default, or 2 %
  packet loss).
- **Minutes down in the last 24 hours** and when the last outage was.
- A **24-hour latency chart** (half-hour averages).
- **Clients and devices** (with how many devices are offline), optional.
- **Current usage**, optional: what the home downloaded and uploaded in the last five minutes. This is traffic, not a
  speed test.
- The ISP's name.

No IP addresses or MAC addresses ever reach a display.

## Setup

1. Sign in at [unifi.ui.com](https://unifi.ui.com) with the account that owns the console.
2. Open **API** (in the left menu, or Settings › API) and choose **Create API Key**. Copy it; UniFi shows it once.
   Site Manager keys are read-only.
3. In Everydaypane, open **Household › Settings › Home & devices › UniFi network**, paste the key and tap **Save key**.
   It is checked with UniFi first, then stored encrypted on the server (`unifi.apiKey`); it is never shown again.
4. Add a **UniFi network** widget (Home group) to a view. If the key sees more than one site, pick one in the widget's
   settings; otherwise it shows the first.

To stop, tap **Remove key**. To use a different UniFi account, paste its key over the old one.

## How often

The server reads the sites (counts, gateway online) once a minute and the ISP metrics (five-minute periods for the last
24 hours) every five minutes, shared by every widget and display in the household. UniFi's cloud itself can lag a few
minutes behind the gateway, so a reading older than 20 minutes isn't shown as live.

## Troubleshooting

- **"UniFi refused the API key"**: the key was deleted or belongs to another account. Make a new one and save it.
- **No latency, only counts**: UniFi hasn't sent ISP metrics yet (new consoles take a while), or it is rate limiting;
  the widget keeps the counts and tries again in five minutes.
- **Down while the internet works**: the console has lost its connection to UniFi's cloud (check Remote Management in
  UniFi OS settings).
