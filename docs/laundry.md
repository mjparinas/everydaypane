# Laundry: washer and dryer

The **Laundry** widget shows each washer and dryer with its phase and time left, and **Done** from the end of a cycle
until the next one starts (or until the time set in Settings › Laundry passes, three hours by default). A finished load
can also put a blue notice on the alert strip. Everything comes from the makers' own cloud APIs; nothing runs at home
and Home Assistant isn't involved.

## LG (ThinQ)

1. Make sure the machines are in the LG ThinQ phone app and have remote monitoring on.
2. Open <https://connect-pat.lgthinq.com> and sign in with the same LG account.
3. **Add new token**, give it a name (Everydaypane), tick the device permissions (at least "Permission to view all
   devices" and "Permission to view device status"), and create it.
4. Copy the token. In Everydaypane open **Settings › Home & devices › Laundry**, choose the account's country, paste the
   token and tap **Connect LG ThinQ**. It is checked with LG first, then stored encrypted; it never comes back to a
   browser.

The country picks LG's servers (Canada and the US use the Americas ones). If you change it, publish to the wall and
connect again.

Washers, dryers, WashTowers and WashCombos are all read. A WashCombo with a mini washer shows as two machines.

## Samsung (SmartThings)

Connect SmartThings under **Settings › Smart home** (the same connection the Smart device widget uses). Washers and
dryers in that account appear on their own; there is nothing more to set up.

## How "done" works

Machines rarely say "done" for long: an LG washer shows END for a few minutes and then switches off, and a Samsung goes
back to "stopped". So the server remembers each cycle (`laundry_state`): a machine that was running and then stops is
done, at the time the cycle was due to end if that has passed, otherwise when it was seen stopping. It stays done until
the next cycle starts or the done time passes.

The server reads both services once a minute per household, shared by every screen; the wall counts the minutes down
between reads.

## The alert strip

With **Done notice on the alert strip** on (the default), a finished load shows a blue strip, "Washer is done ·
finished 4:05 p.m.", on every screen. A tap dismisses it on that screen. It needs:

- a Laundry widget on at least one view (so households without one never pay for the calls), and
- alerts switched on in Settings › Alerts (the strip is off when the lowest severity is "never").

Laundry notices are never emailed and don't appear in the Alerts widget. A new notice wakes the screen saver.

## Troubleshooting

- **"LG refused the token"**: the token was deleted or expired at connect-pat.lgthinq.com. Make a new one and paste it.
- **No machines listed**: check the token has the device permissions, and that the machines show in the ThinQ app.
- **"SmartThings needs connecting again"**: connect SmartThings again under Smart home.
- Times are only as fresh as the maker's cloud: a machine with Wi-Fi off reads as off.
