package dev.pro8.homeview.direct;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.IntentFilter;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.drawable.GradientDrawable;
import android.os.IBinder;
import android.os.Handler;
import android.os.PowerManager;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.TextView;

/** Shared-process wake return; optional edge button while Xiaomi is open. */
public final class ReturnOverlayService extends Service {
    private static final String CHANNEL = "homeview_return";
    private WindowManager manager;
    private View button;
    private boolean receiverRegistered;
    private HomeKeyController homeKeys;
    private final Handler screenHandler = new Handler();
    private final BroadcastReceiver screenReceiver = new BroadcastReceiver() {
        @Override public void onReceive(Context context, Intent intent) {
            if (Intent.ACTION_CLOSE_SYSTEM_DIALOGS.equals(intent.getAction()) && "homekey".equals(intent.getStringExtra("reason"))) {
                if (homeKeys != null && isDefaultHome()) homeKeys.pressed();
            } else if (Intent.ACTION_SCREEN_OFF.equals(intent.getAction())) {
                if (homeKeys != null) homeKeys.screenChanged(false);
                screenHandler.removeCallbacksAndMessages(null);
            } else if (Intent.ACTION_SCREEN_ON.equals(intent.getAction())) {
                if (homeKeys != null) homeKeys.screenChanged(true);
                screenHandler.postDelayed(new Runnable() {
                    @Override public void run() {
                        PowerManager power = (PowerManager) getSystemService(POWER_SERVICE);
                        if (power != null && power.isInteractive()) returnHome();
                    }
                }, 500);
            }
        }
    };

    @Override public IBinder onBind(Intent intent) { return null; }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (homeKeys == null) homeKeys = new HomeKeyController(this);
        NotificationManager notifications = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        notifications.createNotificationChannel(new NotificationChannel(
            CHANNEL, "返回 HomeView", NotificationManager.IMPORTANCE_LOW));
        Intent home = HomeActivity.homeIntent(this);
        PendingIntent action = PendingIntent.getActivity(this, 0, home, PendingIntent.FLAG_UPDATE_CURRENT);
        Notification notification = new Notification.Builder(this, CHANNEL)
            .setSmallIcon(android.R.drawable.ic_menu_revert)
            .setContentTitle("HomeView 正在运行")
            .setContentText("轻触返回桌面")
            .setContentIntent(action)
            .setOngoing(true)
            .build();
        startForeground(41, notification);
        if (!receiverRegistered) {
            IntentFilter events = new IntentFilter(Intent.ACTION_SCREEN_ON);
            events.addAction(Intent.ACTION_SCREEN_OFF);
            events.addAction(Intent.ACTION_CLOSE_SYSTEM_DIALOGS);
            registerReceiver(screenReceiver, events);
            receiverRegistered = true;
        }
        if (intent != null && intent.getBooleanExtra("show_overlay", false)) showButton();
        else hideButton();
        return START_STICKY;
    }

    private int dp(float value) {
        return (int) (value * getResources().getDisplayMetrics().density + .5f);
    }

    private void showButton() {
        if (button != null) return;
        manager = (WindowManager) getSystemService(WINDOW_SERVICE);
        TextView view = new TextView(this);
        view.setText("⌂\n返回");
        view.setTextColor(Color.rgb(29, 29, 31));
        view.setTextSize(14);
        view.setGravity(Gravity.CENTER);
        view.setContentDescription("返回 HomeView 桌面");
        GradientDrawable background = new GradientDrawable();
        background.setColor(0xf2ffffff);
        background.setCornerRadius(dp(19));
        view.setBackground(background);
        view.setElevation(dp(5));
        view.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { returnHome(); }
        });
        WindowManager.LayoutParams params = new WindowManager.LayoutParams(
            dp(66), dp(66), WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE |
            WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
            PixelFormat.TRANSLUCENT);
        params.gravity = Gravity.RIGHT | Gravity.CENTER_VERTICAL;
        params.x = dp(10);
        try {
            manager.addView(view, params);
            button = view;
        } catch (RuntimeException ignored) {
            // The persistent notification remains a return path if overlay access is revoked.
        }
    }

    private void hideButton() {
        if (button != null && manager != null) {
            try { manager.removeView(button); } catch (RuntimeException ignored) { }
        }
        button = null;
    }

    private boolean isDefaultHome() {
        Intent home = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME);
        ResolveInfo selected = getPackageManager().resolveActivity(home, PackageManager.MATCH_DEFAULT_ONLY);
        return selected != null && selected.activityInfo != null && getPackageName().equals(selected.activityInfo.packageName);
    }

    private void returnHome() {
        if (!isDefaultHome()) { stopSelf(); return; }
        Intent home = HomeActivity.homeIntent(this);
        startActivity(home);
        hideButton();
    }

    @Override public void onDestroy() {
        if (receiverRegistered) unregisterReceiver(screenReceiver);
        receiverRegistered = false;
        screenHandler.removeCallbacksAndMessages(null);
        hideButton();
        stopForeground(true);
        super.onDestroy();
    }
}
