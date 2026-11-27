package com.everydaypane.app;

import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Matrix;
import android.media.ExifInterface;
import android.net.Uri;
import android.os.Build;
import android.os.Parcelable;
import android.util.Base64;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * "Share › Everydaypane" from Photos, Chrome, Keep and the like (Melvin, 2026-11-27). Pictures are shrunk to the
 * photo frame's 2048 px JPEG and kept with any text or link in the app's own files until the Share page reads them.
 */
final class ShareInbox {
    static final int MAX_SIDE = 2048;
    static final int MAX_IMAGES = 20;

    private ShareInbox() {}

    static File dir(Context c) {
        File d = new File(c.getFilesDir(), "inbox");
        if (!d.exists()) d.mkdirs();
        return d;
    }

    static JSONArray read(Context c) {
        try {
            File f = new File(dir(c), "items.json");
            if (!f.exists()) return new JSONArray();
            return new JSONArray(new String(Files.readAllBytes(f.toPath()), StandardCharsets.UTF_8));
        } catch (Exception e) {
            return new JSONArray();
        }
    }

    static void write(Context c, JSONArray items) {
        try (FileOutputStream out = new FileOutputStream(new File(dir(c), "items.json"))) {
            out.write(items.toString().getBytes(StandardCharsets.UTF_8));
        } catch (Exception ignored) {}
    }

    static void clear(Context c) {
        File[] files = dir(c).listFiles();
        if (files != null) for (File f : files) f.delete();
    }

    /** Keeps what an ACTION_SEND or ACTION_SEND_MULTIPLE intent carries. Answers whether it held anything. */
    static boolean take(Context c, Intent intent) {
        if (intent == null) return false;
        String action = intent.getAction();
        if (!Intent.ACTION_SEND.equals(action) && !Intent.ACTION_SEND_MULTIPLE.equals(action)) return false;
        JSONArray items = read(c);
        int images = 0;
        for (int i = 0; i < items.length(); i++) if ("image".equals(items.optJSONObject(i).optString("kind"))) images++;
        boolean added = false;
        try {
            for (Uri uri : streams(intent)) {
                if (images >= MAX_IMAGES) break;
                JSONObject img = shrink(c, uri);
                if (img != null) {
                    items.put(img);
                    images++;
                    added = true;
                }
            }
            CharSequence text = intent.getCharSequenceExtra(Intent.EXTRA_TEXT);
            if (text != null && text.length() > 0) {
                String t = text.toString();
                if (t.length() > 4000) t = t.substring(0, 4000);
                boolean link = t.matches("(?s)^\\s*https?://\\S+\\s*$");
                items.put(new JSONObject().put("kind", link ? "url" : "text").put("text", t.trim()));
                added = true;
            }
        } catch (Exception ignored) {}
        if (added) write(c, items);
        // Don't take the same share twice on rotation or a relaunch.
        intent.setAction(Intent.ACTION_MAIN);
        return added;
    }

    @SuppressWarnings("deprecation")
    private static List<Uri> streams(Intent intent) {
        List<Uri> out = new ArrayList<>();
        if (Intent.ACTION_SEND_MULTIPLE.equals(intent.getAction())) {
            ArrayList<? extends Parcelable> list = Build.VERSION.SDK_INT >= 33
                ? intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri.class)
                : intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
            if (list != null) for (Parcelable p : list) if (p instanceof Uri) out.add((Uri) p);
        } else {
            Parcelable p = Build.VERSION.SDK_INT >= 33 ? intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri.class) : intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (p instanceof Uri) out.add((Uri) p);
        }
        return out;
    }

    /** Decodes at a fraction of full size first, so a 48 MP photo never sits whole in memory. */
    private static JSONObject shrink(Context c, Uri uri) {
        ContentResolver cr = c.getContentResolver();
        String type = cr.getType(uri);
        if (type != null && !type.startsWith("image/")) return null;
        try {
            BitmapFactory.Options bounds = new BitmapFactory.Options();
            bounds.inJustDecodeBounds = true;
            try (InputStream in = cr.openInputStream(uri)) {
                BitmapFactory.decodeStream(in, null, bounds);
            }
            if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null;
            int sample = 1;
            while (Math.max(bounds.outWidth, bounds.outHeight) / (sample * 2) >= MAX_SIDE) sample *= 2;
            BitmapFactory.Options opts = new BitmapFactory.Options();
            opts.inSampleSize = sample;
            Bitmap bmp;
            try (InputStream in = cr.openInputStream(uri)) {
                bmp = BitmapFactory.decodeStream(in, null, opts);
            }
            if (bmp == null) return null;
            int rotation = 0;
            try (InputStream in = cr.openInputStream(uri)) {
                if (in != null) {
                    int o = new ExifInterface(in).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL);
                    rotation = o == ExifInterface.ORIENTATION_ROTATE_90 ? 90 : o == ExifInterface.ORIENTATION_ROTATE_180 ? 180 : o == ExifInterface.ORIENTATION_ROTATE_270 ? 270 : 0;
                }
            } catch (Exception ignored) {}
            float scale = Math.min(1f, (float) MAX_SIDE / Math.max(bmp.getWidth(), bmp.getHeight()));
            Matrix m = new Matrix();
            m.postScale(scale, scale);
            m.postRotate(rotation);
            Bitmap out = Bitmap.createBitmap(bmp, 0, 0, bmp.getWidth(), bmp.getHeight(), m, true);
            if (out != bmp) bmp.recycle();
            String name = UUID.randomUUID() + ".jpg";
            try (FileOutputStream f = new FileOutputStream(new File(dir(c), name))) {
                out.compress(Bitmap.CompressFormat.JPEG, 85, f);
            }
            JSONObject item = new JSONObject().put("kind", "image").put("file", name).put("width", out.getWidth()).put("height", out.getHeight());
            out.recycle();
            return item;
        } catch (Exception e) {
            return null;
        }
    }

    /** The items as the Share page wants them: pictures as data URLs. */
    static JSONArray forPage(Context c) {
        JSONArray in = read(c);
        JSONArray out = new JSONArray();
        for (int i = 0; i < in.length(); i++) {
            JSONObject item = in.optJSONObject(i);
            if (item == null) continue;
            try {
                if ("image".equals(item.optString("kind"))) {
                    File f = new File(dir(c), item.optString("file"));
                    if (!f.exists()) continue;
                    String data = Base64.encodeToString(Files.readAllBytes(f.toPath()), Base64.NO_WRAP);
                    out.put(new JSONObject()
                        .put("kind", "image")
                        .put("data", "data:image/jpeg;base64," + data)
                        .put("width", item.optInt("width"))
                        .put("height", item.optInt("height"))
                        .put("name", item.optString("file")));
                } else {
                    out.put(new JSONObject().put("kind", item.optString("kind")).put("text", item.optString("text")));
                }
            } catch (Exception ignored) {}
        }
        return out;
    }
}
