# Live cameras (go2rtc)

A Camera widget can play live video from a UniFi Protect camera (or any RTSP camera), and the doorbell pop-up can too.
Browsers can't play RTSP, and the dashboard's server on Vercel can't reach your home network, so a small program called
**go2rtc** runs at home and turns each camera stream into video a browser can play. The wall screen is on the same
network, so it plays straight from go2rtc. The video never leaves the house, and the dashboard never sees the camera
links. Those links work like passwords, so they stay in go2rtc's settings only.

Without go2rtc, Camera widgets still show a Home Assistant snapshot every few seconds, as before.

## 1. Turn on the camera's RTSPS streams

In UniFi Protect, open the camera, then **Settings › Advanced › Share Livestream** and switch on **Secure RTSPS Output**.
Tick **Medium** (960 × 720) for the widget, **High** if you want a sharper doorbell pop-up, and **Package Camera** on a
doorbell with one. Copy each link. They look like this (the last part is a secret token):

```
rtsps://192.168.0.203:7441/AbCdEfGh12345678?enableSrtp
```

For go2rtc, change the start to **`rtspx://`** (RTSPS without checking Protect's self-signed certificate) and drop
**`?enableSrtp`**:

```
rtspx://192.168.0.203:7441/AbCdEfGh12345678
```

Leave the camera on **Standard** encoding (H.264). With "Enhanced" (H.265), choose MJPEG on the widget instead (step 5).

## 2. Run go2rtc

**Home Assistant add-on (easiest if you run Home Assistant OS):** Settings › Add-ons › Add-on store › ⋮ › Repositories,
add `https://github.com/AlexxIT/hassio-addons`, then install **go2rtc** and start it. Its settings file is
`/config/go2rtc.yaml` (open it with the File editor or Studio Code Server add-on). Home Assistant's own built-in go2rtc
only listens inside Home Assistant, so it can't serve the screens; use the add-on.

**Docker (any always-on computer at home):**

```bash
docker run -d --name go2rtc --restart unless-stopped --network host \
  -v /opt/go2rtc:/config alexxit/go2rtc
```

The settings file is then `/opt/go2rtc/go2rtc.yaml`.

## 3. Name the streams

Put the camera links in `go2rtc.yaml` (replace the tokens with yours):

```yaml
streams:
  front_door: rtspx://192.168.0.203:7441/MEDIUM_TOKEN # 960 × 720, for widgets
  front_door_hd: rtspx://192.168.0.203:7441/HIGH_TOKEN # 1600 × 1200, for the doorbell pop-up
  front_door_package: rtspx://192.168.0.203:7441/PACKAGE_TOKEN # the doorbell's package camera
```

Restart go2rtc and open `http://<its address>:1984/` on a computer at home: each stream should play there.

## 4. Give go2rtc an https address

The dashboard is an https page, and browsers refuse plain http video on one, so go2rtc needs an https address with a
real certificate. One way that keeps everything at home, using the getliftsmith.com domain that's already on Cloudflare:

1. In Cloudflare DNS, add an **A** record `cams` → go2rtc's home address (for example `192.168.0.50`), **DNS only** (grey
   cloud). The name only works inside the house, because the address is a private one.
2. Get a certificate for `cams.getliftsmith.com` with a DNS challenge, which never needs the house reachable from the
   internet. In Home Assistant, the **Let's Encrypt** add-on does this: domains `cams.getliftsmith.com`, challenge
   `dns`, provider `dns-cloudflare`, and a Cloudflare API token with Zone › DNS › Edit. It writes `fullchain.pem` and
   `privkey.pem` to `/ssl/` and renews them. (With Docker, `certbot` with the `dns-cloudflare` plugin does the same.)
3. Tell go2rtc to serve https too, in `go2rtc.yaml`:

   ```yaml
   api:
     listen: ":1984"
     tls_listen: ":8443"
     tls_cert: /ssl/fullchain.pem
     tls_key: /ssl/privkey.pem
   ```

   If the add-on can't read `/ssl`, copy the two files to `/config/` and point at them there. With Docker, mount the
   certificate folder into the container.

4. Restart go2rtc and open `https://cams.getliftsmith.com:8443/` on a phone on your home WiFi. It should load with no
   certificate warning. If the name doesn't resolve, the router may block public names that point at home addresses
   ("DNS rebinding protection"); allow `cams.getliftsmith.com` there.

Never forward go2rtc's ports on the router. Its page has no password, and anyone on the home WiFi can watch, as they
could the cameras themselves. Keep guests on a separate guest network.

## 5. Connect the dashboard

1. Admin panel › Settings › **Live cameras**: enter `https://cams.getliftsmith.com:8443` and Save.
2. On a Camera widget, set **Picture from** to **Live video (go2rtc at home)** and **Stream name** to `front_door`.
   **Format** is **Video** for H.264 cameras (the screen decodes the camera's own stream, which is the lightest), or
   **MJPEG** if go2rtc has to convert it (H.265 cameras; this uses go2rtc's CPU).
3. For the doorbell pop-up, Settings › Home Assistant › Doorbell pop-up › **Live video stream**: `front_door_hd`. The
   ring still comes from Home Assistant.

The first time, the screen's browser may ask to let the dashboard reach devices on your local network. Allow it.

## How it behaves

- Video plays only while it could be seen: it stops while the page is hidden, while the widget is off screen, and while
  the night schedule dims the screen to 80 % or more, and starts again after.
- If the stream fails or the picture freezes, the widget says "Camera offline · trying again" and reconnects after 5,
  10, 20 seconds and then every minute. A video that falls more than four seconds behind skips to the newest picture.
- Changing the go2rtc address reloads each screen once, since the page's security policy names the address video may
  come from.
- A screen away from home (on another network) can't reach go2rtc, so its live widgets stay "offline". Snapshot widgets
  through Home Assistant work anywhere.
