package dev.pro8.homeview.direct;

import android.app.admin.DevicePolicyManager;
import android.content.ComponentName;
import android.content.Context;
import android.os.PowerManager;
import android.os.SystemClock;
import android.widget.Toast;

/** Two actual HOME-key broadcasts lock the screen; wake and programmatic returns never count. */
final class HomeKeyController {
    private final Context context;
    private final DevicePolicyManager policy;
    private final PowerManager power;
    private final ComponentName admin;
    private long lastPress,screenChange;
    private static volatile long sharedScreenChange;
    private static volatile boolean screenOff;
    HomeKeyController(Context c){context=c.getApplicationContext();policy=(DevicePolicyManager)c.getSystemService(Context.DEVICE_POLICY_SERVICE);power=(PowerManager)c.getSystemService(Context.POWER_SERVICE);admin=new ComponentName(c,HomeViewAdmin.class);}
    boolean authorized(){return policy!=null&&policy.isAdminActive(admin);}
    void screenChanged(boolean on){lastPress=0;screenChange=SystemClock.elapsedRealtime();sharedScreenChange=screenChange;screenOff=!on;}
    static long screenAge(){return SystemClock.elapsedRealtime()-sharedScreenChange;}
    static boolean awake(Context c){PowerManager power=(PowerManager)c.getSystemService(Context.POWER_SERVICE);return !screenOff&&power!=null&&power.isInteractive();}
    static void visible(Context c){if(screenOff){PowerManager power=(PowerManager)c.getSystemService(Context.POWER_SERVICE);if(power!=null&&power.isInteractive()){screenOff=false;sharedScreenChange=SystemClock.elapsedRealtime();}}}
    void pressed(){
        long now=SystemClock.elapsedRealtime();
        if(power==null||!power.isInteractive()||now-screenChange<650||!context.getSharedPreferences("homeview_pro8",0).getBoolean("double_home_sleep",true)){lastPress=0;return;}
        if(lastPress>0&&now-lastPress>=60&&now-lastPress<=420){
            lastPress=0;
            if(authorized())try{policy.lockNow();}catch(SecurityException e){Toast.makeText(context,"熄屏授权已取消，请在连接设置中重新启用",Toast.LENGTH_SHORT).show();}
            else Toast.makeText(context,"请在连接设置中启用双击熄屏",Toast.LENGTH_SHORT).show();
        }else lastPress=now;
    }
}
