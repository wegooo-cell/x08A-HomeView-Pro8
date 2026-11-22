package dev.pro8.homeview.direct;
import android.content.*;
public final class TimerAlarmReceiver extends BroadcastReceiver {
 @Override public void onReceive(Context c,Intent i){String id=i.getStringExtra("timer_id");if(id!=null)LocalTimers.fire(c,id);}
}
