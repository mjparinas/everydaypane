package com.everydaypane.app;

import android.content.Context;
import android.content.SharedPreferences;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * What the app, its home-screen widget and the home geofence share (Melvin, 2026-11-27): the app token the page
 * registered, the site's address and the widget's last good answer. App-private preferences; never on the web side
 * except the token the page itself handed over.
 */
final class Session {
    private static final String PREFS = "everydaypane";

    private Session() {}

    static SharedPreferences prefs(Context c) {
        return c.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static String baseUrl(Context c) {
        return prefs(c).getString("baseUrl", null);
    }

    static String appToken(Context c) {
        return prefs(c).getString("appToken", null);
    }

    static String deviceId(Context c) {
        return prefs(c).getString("deviceId", null);
    }

    /** A call to our API with the app token. Answers [status, body], or null when not signed in. Off the main thread only. */
    static Object[] api(Context c, String method, String path, String json) {
        String base = baseUrl(c);
        String token = appToken(c);
        if (base == null || token == null) return null;
        HttpURLConnection conn = null;
        try {
            URL url = new URL(new URL(base), path);
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod(method);
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(20000);
            conn.setRequestProperty("Authorization", "Bearer " + token);
            if (json != null) {
                conn.setDoOutput(true);
                conn.setRequestProperty("Content-Type", "application/json");
                try (OutputStream out = conn.getOutputStream()) {
                    out.write(json.getBytes(StandardCharsets.UTF_8));
                }
            }
            int status = conn.getResponseCode();
            InputStream in = status < 400 ? conn.getInputStream() : conn.getErrorStream();
            String body = "";
            if (in != null) {
                ByteArrayOutputStream buf = new ByteArrayOutputStream();
                byte[] chunk = new byte[8192];
                int n;
                while ((n = in.read(chunk)) > 0) buf.write(chunk, 0, n);
                in.close();
                body = buf.toString("UTF-8");
            }
            return new Object[] { status, body };
        } catch (Exception e) {
            return new Object[] { 0, "" };
        } finally {
            if (conn != null) conn.disconnect();
        }
    }
}
