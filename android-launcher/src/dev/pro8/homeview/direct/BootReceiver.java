package dev.pro8.homeview.direct;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;

/** Start the user's selected Home after the firmware's boot sequence. */
public final class BootReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        if(Intent.ACTION_TIME_CHANGED.equals(intent.getAction())||Intent.ACTION_TIMEZONE_CHANGED.equals(intent.getAction())){LocalClock.restore(context,true);LocalTimers.restore(context);return;}
        if (!Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) return;
        LocalTimers.restore(context);LocalClock.restore(context,false);
        Intent home = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME);
        ResolveInfo selected = context.getPackageManager().resolveActivity(home, PackageManager.MATCH_DEFAULT_ONLY);
        if (selected == null || selected.activityInfo == null ||
                !context.getPackageName().equals(selected.activityInfo.packageName)) return;
        context.startActivity(HomeActivity.homeIntent(context));
    }
}
