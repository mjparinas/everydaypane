package com.everydaypane.app;

import android.annotation.SuppressLint;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import com.google.android.gms.location.Geofence;
import com.google.android.gms.location.GeofencingEvent;
import com.google.android.gms.location.GeofencingRequest;
import com.google.android.gms.location.LocationServices;

import java.util.Collections;

/**
 * One circle around home (Melvin, 2026-11-27: groundwork for a phone-based "who's home"). Google Play services
 * watches it with almost no battery and wakes GeofenceReceiver on arriving or leaving; we tell the server "home" or
 * "away" with the app token. Home's coordinates stay on the phone. Geofences don't survive a reboot or an app
 * update, so BootReceiver puts it back.
 */
final class HomeGeofence {
    static final String ID = "everydaypane.home";

    private HomeGeofence() {}

    static boolean active(Context c) {
        return Session.prefs(c).getBoolean("geofence", false);
    }

    private static PendingIntent intent(Context c) {
        Intent i = new Intent(c, GeofenceReceiver.class);
        return PendingIntent.getBroadcast(c, 0, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE);
    }

    @SuppressLint("MissingPermission") // The plugin checks background location before calling this.
    static void start(Context c, double lat, double lon, float radius, Runnable done) {
        Session.prefs(c).edit()
            .putBoolean("geofence", true)
            .putFloat("homeLat", (float) lat)
            .putFloat("homeLon", (float) lon)
            .putFloat("homeRadius", radius)
            .apply();
        Geofence fence = new Geofence.Builder()
            .setRequestId(ID)
            .setCircularRegion(lat, lon, Math.max(100f, radius))
            .setExpirationDuration(Geofence.NEVER_EXPIRE)
            .setTransitionTypes(Geofence.GEOFENCE_TRANSITION_ENTER | Geofence.GEOFENCE_TRANSITION_EXIT)
            .build();
        GeofencingRequest req = new GeofencingRequest.Builder()
            .setInitialTrigger(GeofencingRequest.INITIAL_TRIGGER_ENTER | GeofencingRequest.INITIAL_TRIGGER_EXIT)
            .addGeofence(fence)
            .build();
        try {
            LocationServices.getGeofencingClient(c).addGeofences(req, intent(c)).addOnCompleteListener(t -> {
                if (done != null) done.run();
            });
        } catch (SecurityException e) {
            Session.prefs(c).edit().putBoolean("geofence", false).apply();
            if (done != null) done.run();
        }
    }

    /** After a reboot: the same circle again, if it was on. */
    static void restore(Context c) {
        if (!active(c)) return;
        android.content.SharedPreferences p = Session.prefs(c);
        start(c, p.getFloat("homeLat", 0f), p.getFloat("homeLon", 0f), p.getFloat("homeRadius", 150f), null);
    }

    static void stop(Context c) {
        Session.prefs(c).edit().putBoolean("geofence", false).apply();
        LocationServices.getGeofencingClient(c).removeGeofences(Collections.singletonList(ID));
    }

    public static class GeofenceReceiver extends BroadcastReceiver {
        @Override
        public void onReceive(Context context, Intent intent) {
            GeofencingEvent event = GeofencingEvent.fromIntent(intent);
            if (event == null || event.hasError()) return;
            int t = event.getGeofenceTransition();
            String state = t == Geofence.GEOFENCE_TRANSITION_ENTER ? "home" : t == Geofence.GEOFENCE_TRANSITION_EXIT ? "away" : null;
            if (state == null) return;
            PendingResult pending = goAsync();
            Context app = context.getApplicationContext();
            new Thread(() -> {
                try {
                    Session.api(app, "POST", "/api/mobile/presence/", "{\"state\":\"" + state + "\"}");
                } finally {
                    pending.finish();
                }
            }).start();
        }
    }

    public static class BootReceiver extends BroadcastReceiver {
        @Override
        public void onReceive(Context context, Intent intent) {
            String a = intent.getAction();
            if (Intent.ACTION_BOOT_COMPLETED.equals(a) || Intent.ACTION_MY_PACKAGE_REPLACED.equals(a)) restore(context.getApplicationContext());
        }
    }
}
