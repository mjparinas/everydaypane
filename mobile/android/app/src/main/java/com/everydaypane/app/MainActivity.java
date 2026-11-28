package com.everydaypane.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.WebView;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

/**
 * The app's one activity (Melvin, 2026-11-27). Registers the Everydaypane plugin, makes the notification channels
 * the server's pushes name, takes shares from other apps, and switches "wall mode" on while the page is the wall
 * display (/display/): screen kept on and system bars hidden, so a tablet on the wall is a kiosk. Screen pinning
 * (Settings › Security) locks it to the app, as docs/mobile-app.md explains.
 */
public class MainActivity extends BridgeActivity {
    private boolean wallMode = false;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(EverydaypanePlugin.class);
        super.onCreate(savedInstanceState);
        createChannels();
        ShareInbox.take(this, getIntent());
        bridge.addWebViewListener(
            new WebViewListener() {
                @Override
                public void onPageLoaded(WebView webView) {
                    applyWallMode(webView.getUrl());
                }

                @Override
                public void onPageCommitVisible(WebView view, String url) {
                    applyWallMode(url);
                }
            }
        );
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (ShareInbox.take(this, intent)) EverydaypanePlugin.shareArrived();
    }

    @Override
    public void onResume() {
        super.onResume();
        // System bars come back after a dialog or the notification shade; hide them again on the wall.
        if (wallMode) hideBars(true);
    }

    static boolean isWall(String url) {
        if (url == null) return false;
        String path = Uri.parse(url).getPath();
        return path != null && (path.equals("/display") || path.startsWith("/display/"));
    }

    private void applyWallMode(String url) {
        boolean on = isWall(url);
        if (on == wallMode) return;
        wallMode = on;
        runOnUiThread(() -> {
            if (on) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            hideBars(on);
        });
    }

    private void hideBars(boolean hide) {
        WindowInsetsControllerCompat c = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        if (hide) {
            c.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            c.hide(WindowInsetsCompat.Type.systemBars());
        } else {
            c.show(WindowInsetsCompat.Type.systemBars());
        }
    }

    /** Channel ids match `kind` in src/server/push.ts. */
    private void createChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm == null) return;
        NotificationChannel messages = new NotificationChannel("messages", "Family Messages", NotificationManager.IMPORTANCE_DEFAULT);
        messages.setDescription("New notes on the family message board");
        NotificationChannel alerts = new NotificationChannel("alerts", "Alerts and Laundry", NotificationManager.IMPORTANCE_HIGH);
        alerts.setDescription("Emergency alerts for home, and the washer or dryer finishing");
        nm.createNotificationChannel(messages);
        nm.createNotificationChannel(alerts);
    }
}
