package uz.voli.app.push;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.view.View;
import android.widget.RemoteViews;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import java.util.Map;
import uz.voli.app.MainActivity;
import uz.voli.app.R;

/**
 * The charge on the lock screen: one card per charge, updated in place
 * without a sound — station, percentage, a bar, energy, cost and power —
 * then, at the end, the same card with the result and one sound.
 *
 * The server sends the numbers and every label already in the driver's
 * language (server/push.js, sendLiveCard).
 */
final class ChargeNotice {

    private static final String LIVE_CHANNEL = "voli-live";
    private static final String MAIN_CHANNEL = "voli";

    private ChargeNotice() {}

    static void show(Context ctx, Map<String, String> d) {
        String stage = val(d, "stage", "live");
        boolean live = "live".equals(stage);
        boolean done = "done".equals(stage);
        String pctRaw = val(d, "pct", "");
        int pct = -1;
        try {
            if (!pctRaw.isEmpty()) pct = Math.max(0, Math.min(100, Integer.parseInt(pctRaw)));
        } catch (NumberFormatException ignored) {}
        if (done && pct < 0) pct = 100;

        channels(ctx);
        RemoteViews small = new RemoteViews(ctx.getPackageName(), R.layout.notice_charge_small);
        RemoteViews big = new RemoteViews(ctx.getPackageName(), R.layout.notice_charge_big);
        for (RemoteViews v : new RemoteViews[] { small, big }) {
            v.setTextViewText(R.id.station, val(d, "station", "Voli"));
            v.setTextViewText(R.id.pct, pct >= 0 ? pct + "%" : (done ? "✓" : "⚡"));
            // Without a percentage the bar runs on its own, so the card still looks alive.
            v.setProgressBar(R.id.bar, 100, Math.max(pct, 0), live && pct < 0);
        }
        big.setTextViewText(R.id.sub, val(d, "sub", ""));
        big.setTextViewText(R.id.l_energy, val(d, "lEnergy", "Energy"));
        big.setTextViewText(R.id.v_energy, val(d, "energy", "0") + " " + val(d, "uKwh", "kWh"));
        big.setTextViewText(R.id.l_cost, val(d, "lCost", "Cost"));
        big.setTextViewText(R.id.v_cost, val(d, "cost", "0") + " " + val(d, "uSum", "UZS"));
        String power = val(d, "power", "");
        if (power.isEmpty()) {
            big.setViewVisibility(R.id.power_box, View.INVISIBLE);
        } else {
            big.setTextViewText(R.id.l_power, val(d, "lPower", "Power"));
            big.setTextViewText(R.id.v_power, power + " " + val(d, "uKw", "kW"));
        }
        String left = val(d, "left", "");
        String status = val(d, "status", "");
        big.setTextViewText(R.id.status, live && !left.isEmpty() ? "⚡ " + status + " · " + left : (live ? "⚡ " : "") + status);

        String tag = val(d, "tag", "charge");
        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, live ? LIVE_CHANNEL : MAIN_CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_voli)
            .setColor(0xFFFFC83D)
            .setContentTitle(val(d, "title", "Voli"))
            .setContentText(val(d, "body", ""))
            .setCustomContentView(small)
            .setCustomBigContentView(big)
            .setCustomHeadsUpContentView(small)
            .setStyle(new NotificationCompat.DecoratedCustomViewStyle())
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setCategory(live ? NotificationCompat.CATEGORY_PROGRESS : NotificationCompat.CATEGORY_STATUS)
            .setContentIntent(open(ctx, tag, val(d, "url", "/?portal=driver")))
            .setShowWhen(!live);
        if (live) {
            b.setOngoing(true)
                .setOnlyAlertOnce(true)
                .setSilent(true)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                // A card the server stopped updating does not stay forever.
                .setTimeoutAfter(30 * 60_000L);
        } else {
            b.setAutoCancel(true).setPriority(NotificationCompat.PRIORITY_HIGH);
        }
        try {
            NotificationManagerCompat.from(ctx).notify(tag, 0, b.build());
        } catch (SecurityException ignored) {
            // Notifications not allowed on this phone.
        }
    }

    private static PendingIntent open(Context ctx, String tag, String url) {
        Intent i = new Intent(ctx, MainActivity.class);
        i.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        // The push plugin reads these and opens the screen in the app (nativePush.ts).
        i.putExtra("google.message_id", tag);
        i.putExtra("url", url);
        return PendingIntent.getActivity(ctx, tag.hashCode(), i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static void channels(Context ctx) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = ctx.getSystemService(NotificationManager.class);
        if (nm == null) return;
        if (nm.getNotificationChannel(LIVE_CHANNEL) == null) {
            NotificationChannel c = new NotificationChannel(LIVE_CHANNEL, "Voli · зарядка сейчас", NotificationManager.IMPORTANCE_LOW);
            c.setDescription("Ход зарядки на экране блокировки");
            c.setShowBadge(false);
            c.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
            nm.createNotificationChannel(c);
        }
        if (nm.getNotificationChannel(MAIN_CHANNEL) == null) {
            NotificationChannel c = new NotificationChannel(MAIN_CHANNEL, "Voli", NotificationManager.IMPORTANCE_HIGH);
            c.setDescription("Зарядка, очередь, бронь и оплата");
            nm.createNotificationChannel(c);
        }
    }

    private static String val(Map<String, String> d, String key, String fallback) {
        String v = d.get(key);
        return v == null || v.isEmpty() ? fallback : v;
    }
}
