package com.everydaypane.app;

import android.Manifest;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONException;

/**
 * The Everydaypane app's own native bridge (`window.Capacitor` › "Everydaypane", called from src/lib/nativeApp.ts):
 * the app token for widgets and the geofence, the share inbox, widget refreshes and the home geofence.
 */
@CapacitorPlugin(
    name = "Everydaypane",
    permissions = {
        @Permission(alias = "location", strings = { Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION }),
        @Permission(alias = "background", strings = { Manifest.permission.ACCESS_BACKGROUND_LOCATION }),
    }
)
public class EverydaypanePlugin extends Plugin {
    private static EverydaypanePlugin instance;

    @Override
    public void load() {
        instance = this;
    }

    /** MainActivity calls this when a share arrives while the app is open. */
    static void shareArrived() {
        if (instance != null) instance.notifyListeners("shareReceived", new JSObject());
    }

    @PluginMethod
    public void info(PluginCall call) {
        JSObject r = new JSObject();
        r.put("platform", "android");
        r.put("pushEnv", "production");
        String version = "";
        try {
            version = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0).versionName;
        } catch (Exception ignored) {}
        r.put("version", version);
        String model = Build.MODEL == null ? "Android" : Build.MODEL;
        r.put("deviceName", model.length() > 60 ? model.substring(0, 60) : model);
        call.resolve(r);
    }

    @PluginMethod
    public void getSession(PluginCall call) {
        JSObject r = new JSObject();
        r.put("deviceId", Session.deviceId(getContext()));
        r.put("appToken", Session.appToken(getContext()));
        call.resolve(r);
    }

    @PluginMethod
    public void setSession(PluginCall call) {
        String deviceId = call.getString("deviceId");
        String baseUrl = call.getString("baseUrl");
        if (deviceId == null || baseUrl == null) {
            call.reject("deviceId and baseUrl are needed");
            return;
        }
        android.content.SharedPreferences.Editor e = Session.prefs(getContext()).edit().putString("deviceId", deviceId).putString("baseUrl", baseUrl);
        String token = call.getString("appToken");
        if (token != null) e.putString("appToken", token);
        e.apply();
        TodayWidget.refreshAll(getContext());
        call.resolve();
    }

    @PluginMethod
    public void clearSession(PluginCall call) {
        HomeGeofence.stop(getContext());
        Session.prefs(getContext()).edit().clear().apply();
        TodayWidget.refreshAll(getContext());
        call.resolve();
    }

    @PluginMethod
    public void refreshWidgets(PluginCall call) {
        TodayWidget.refreshAll(getContext());
        call.resolve();
    }

    @PluginMethod
    public void getSharedItems(PluginCall call) {
        getBridge().execute(() -> {
            try {
                JSObject r = new JSObject();
                r.put("items", new JSArray(ShareInbox.forPage(getContext()).toString()));
                call.resolve(r);
            } catch (JSONException e) {
                call.reject("Couldn't read what was shared");
            }
        });
    }

    @PluginMethod
    public void clearSharedItems(PluginCall call) {
        ShareInbox.clear(getContext());
        call.resolve();
    }

    // ---- Home geofence -----------------------------------------------------------------------------------------

    private String permission() {
        if (getPermissionState("location") != PermissionState.GRANTED) {
            return getPermissionState("location") == PermissionState.DENIED ? "denied" : "prompt";
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && getPermissionState("background") != PermissionState.GRANTED) return "whenInUse";
        return "always";
    }

    private JSObject state() {
        JSObject r = new JSObject();
        r.put("permission", permission());
        r.put("active", HomeGeofence.active(getContext()));
        return r;
    }

    @PluginMethod
    public void locationState(PluginCall call) {
        call.resolve(state());
    }

    /** Foreground location first, then (Android 10+) "Allow all the time", which Android asks for on its own. */
    @PluginMethod
    public void requestLocation(PluginCall call) {
        String p = permission();
        if (p.equals("prompt")) requestPermissionForAlias("location", call, "afterForeground");
        else if (p.equals("whenInUse")) requestPermissionForAlias("background", call, "afterBackground");
        else call.resolve(state());
    }

    @PermissionCallback
    private void afterForeground(PluginCall call) {
        if (permission().equals("whenInUse")) requestPermissionForAlias("background", call, "afterBackground");
        else call.resolve(state());
    }

    @PermissionCallback
    private void afterBackground(PluginCall call) {
        call.resolve(state());
    }

    @PluginMethod
    public void startHomeGeofence(PluginCall call) {
        Double lat = call.getDouble("latitude");
        Double lon = call.getDouble("longitude");
        Double radius = call.getDouble("radius", 150.0);
        if (lat == null || lon == null) {
            call.reject("latitude and longitude are needed");
            return;
        }
        if (!permission().equals("always")) {
            call.resolve(state());
            return;
        }
        HomeGeofence.start(getContext(), lat, lon, radius == null ? 150f : radius.floatValue(), () -> call.resolve(state()));
    }

    @PluginMethod
    public void stopHomeGeofence(PluginCall call) {
        HomeGeofence.stop(getContext());
        call.resolve();
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getContext().getPackageName()));
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(i);
        call.resolve();
    }
}
