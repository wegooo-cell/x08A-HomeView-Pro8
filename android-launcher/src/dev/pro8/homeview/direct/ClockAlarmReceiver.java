package dev.pro8.homeview.direct;
import android.content.*;
import org.json.JSONObject;
public final class ClockAlarmReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context c,Intent i){String action=i.getAction(),id=i.getStringExtra("alarm_id");if(id==null)return;if("dev.pro8.homeview.CLOCK_FIRE".equals(action))LocalClock.fire(c,id,i.getBooleanExtra("snooze_alarm",false),i.getLongExtra("expected_at",0));else if("dev.pro8.homeview.CLOCK_DISMISS".equals(action)||"dev.pro8.homeview.CLOCK_SNOOZE".equals(action))try{LocalClock.command(c,NetEaseClient.obj("action",action.endsWith("SNOOZE")?"alarm-snooze":"alarm-dismiss","id",id));}catch(Exception ignored){}}
}
