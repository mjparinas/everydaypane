package com.everydaypane.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * The home-screen widget (Melvin, 2026-11-27: "native add to homepage for Android, iOS"): tonight's dinner, the
 * shopping list and chores left today, from /api/mobile/widget/ with the app token. Android refreshes it every half
 * hour; the app asks for a refresh when someone leaves it, and the last good answer shows while offline.
 */
public class TodayWidget extends AppWidgetProvider {

    /** Asks every Everydaypane widget on the home screen to refresh. */
    static void refreshAll(Context c) {
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        int[] ids = m.getAppWidgetIds(new ComponentName(c, TodayWidget.class));
        if (ids.length == 0) return;
        Intent i = new Intent(c, TodayWidget.class).setAction(AppWidgetManager.ACTION_APPWIDGET_UPDATE);
        i.putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids);
        c.sendBroadcast(i);
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        Context app = context.getApplicationContext();
        // Draw what we have at once, then fetch.
        for (int id : ids) manager.updateAppWidget(id, render(app, manager, id, Session.prefs(app).getString("widgetCache", null)));
        PendingResult pending = goAsync();
        new Thread(() -> {
            try {
                Object[] r = Session.api(app, "GET", "/api/mobile/widget/", null);
                String body = null;
                if (r == null || (int) r[0] == 401) {
                    Session.prefs(app).edit().remove("widgetCache").apply();
                } else if ((int) r[0] == 200) {
                    body = (String) r[1];
                    Session.prefs(app).edit().putString("widgetCache", body).apply();
                } else {
                    body = Session.prefs(app).getString("widgetCache", null);
                }
                for (int id : ids) manager.updateAppWidget(id, render(app, manager, id, body));
            } finally {
                pending.finish();
            }
        }).start();
    }

    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int id, Bundle options) {
        manager.updateAppWidget(id, render(context, manager, id, Session.prefs(context).getString("widgetCache", null)));
    }

    private static RemoteViews render(Context c, AppWidgetManager manager, int id, String json) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_today);
        Intent open = new Intent(c, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        v.setOnClickPendingIntent(R.id.widget_root, PendingIntent.getActivity(c, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
        Bundle opts = manager.getAppWidgetOptions(id);
        int minHeight = opts == null ? 0 : opts.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 0);
        int lines = minHeight >= 220 ? 6 : 3;
        boolean small = minHeight > 0 && minHeight < 110;
        if (json == null) {
            v.setTextViewText(R.id.dinner_label, "Everydaypane");
            v.setTextViewText(R.id.dinner_text, Session.appToken(c) == null ? "Open the app and sign in." : "Open the app to load your day.");
            v.setTextViewText(R.id.shopping, "");
            v.setTextViewText(R.id.chores, "");
            return v;
        }
        try {
            JSONObject s = new JSONObject(json);
            JSONObject dinner = s.optJSONObject("dinner");
            v.setTextViewText(R.id.dinner_label, dinner == null ? "Dinner" : dinner.optString("label", "Tonight"));
            v.setTextViewText(R.id.dinner_text, dinner == null ? "Nothing planned" : dinner.optString("text"));
            JSONObject shopping = s.getJSONObject("shopping");
            JSONObject chores = s.getJSONObject("chores");
            StringBuilder shop = new StringBuilder("Shopping · ").append(shopping.optInt("open"));
            StringBuilder todo = new StringBuilder("Chores · ");
            todo.append(chores.optInt("total") == 0 ? "none today" : chores.optInt("left") + " left");
            if (!small) {
                JSONArray items = shopping.optJSONArray("items");
                for (int i = 0; items != null && i < Math.min(lines, items.length()); i++) shop.append("\n").append(items.optString(i));
                if (shopping.optInt("open") == 0) shop.append("\nAll bought");
                JSONArray people = chores.optJSONArray("people");
                for (int i = 0; people != null && i < Math.min(lines, people.length()); i++) {
                    JSONObject p = people.optJSONObject(i);
                    int left = p.optInt("left");
                    todo.append("\n").append(p.optString("emoji")).append(" ").append(p.optString("name")).append(": ").append(left == 0 ? "done" : left + " left");
                }
            }
            v.setTextViewText(R.id.shopping, shop.toString());
            v.setTextViewText(R.id.chores, todo.toString());
        } catch (Exception e) {
            v.setTextViewText(R.id.dinner_label, "Everydaypane");
            v.setTextViewText(R.id.dinner_text, "Open the app to load your day.");
        }
        return v;
    }
}
