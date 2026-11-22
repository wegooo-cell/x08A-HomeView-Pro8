package dev.pro8.homeview.direct;

import android.content.Context;
import android.content.Intent;
import android.content.ComponentName;
import android.content.pm.PackageManager;
import android.content.pm.PackageInfo;
import android.content.pm.ResolveInfo;
import android.os.StatFs;
import android.provider.Settings;
import org.json.JSONObject;

/** Read-only launcher state. Never changes HOME selection or component enabled states. */
final class LocalLauncherStatus {
    static JSONObject state(Context context)throws Exception{
        PackageManager pm=context.getPackageManager();
        ResolveInfo selected=pm.resolveActivity(new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME),PackageManager.MATCH_DEFAULT_ONLY);
        boolean chosen=selected!=null&&selected.activityInfo!=null&&context.getPackageName().equals(selected.activityInfo.packageName);
        PackageInfo info=pm.getPackageInfo(context.getPackageName(),0);
        boolean boot=false;try{boot=pm.getReceiverInfo(new ComponentName(context,BootReceiver.class),PackageManager.MATCH_DISABLED_COMPONENTS).enabled;}catch(Exception ignored){}
        return NetEaseClient.obj("ok",true,"default_home",chosen,"boot_receiver_enabled",boot,"version",info.versionCode,"version_name",info.versionName,"free_bytes",new StatFs(context.getFilesDir().getPath()).getAvailableBytes(),"home_settings_available",homeSettings(context)!=null,"system_settings_available",new Intent(Settings.ACTION_SETTINGS).resolveActivity(pm)!=null,"input_method",LocalInputMethod.state(context));
    }
    static Intent homeSettings(Context context){
        for(String action:new String[]{Settings.ACTION_HOME_SETTINGS,Settings.ACTION_MANAGE_DEFAULT_APPS_SETTINGS,Settings.ACTION_SETTINGS}){
            Intent intent=new Intent(action);if(intent.resolveActivity(context.getPackageManager())!=null)return intent;
        }
        return null;
    }
}
