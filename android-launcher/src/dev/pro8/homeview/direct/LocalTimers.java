package dev.pro8.homeview.direct;

import android.app.*;
import android.content.*;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import org.json.*;
import java.util.UUID;

/** Persisted deadlines, scheduled by Android rather than a WebView interval. */
final class LocalTimers {
    private static final Object LOCK=new Object();
    private static android.content.SharedPreferences prefs(Context c){return c.getSharedPreferences("homeview_pro8",0);}
    private static JSONArray read(Context c)throws Exception{return new JSONArray(prefs(c).getString("local_timers","[]"));}
    private static void save(Context c,JSONArray a){if(!prefs(c).edit().putString("local_timers",a.toString()).commit())throw new IllegalStateException("计时状态未能保存");}
    private static double now(){return System.currentTimeMillis()/1000.0;}
    private static JSONObject initial()throws Exception{return NetEaseClient.obj("id","primary","label","休息一下","total",300,"remaining",300,"status","ready","ends",0);}
    private static String status(JSONObject t){return t.optString("status",t.optDouble("ends")>0?"running":"ready");}
    private static int boot(Context c){return android.provider.Settings.Global.getInt(c.getContentResolver(),"boot_count",0);}
    private static double left(Context c,JSONObject t){if(t.optInt("boot",-1)==boot(c)&&t.has("elapsed_end"))return Math.max(0,(t.optDouble("elapsed_end")-android.os.SystemClock.elapsedRealtime())/1000.0);return Math.max(0,t.optDouble("ends")-now());}
    private static void deadline(Context c,JSONObject t,double sec)throws Exception{t.put("ends",now()+sec).put("elapsed_end",android.os.SystemClock.elapsedRealtime()+sec*1000).put("boot",boot(c));}
    private static JSONObject normalize(Context c,JSONObject t)throws Exception{String s=status(t);if(s.equals("running")){double remaining=left(c,t);t.put("remaining",remaining).put("ends",now()+remaining);if(remaining<=0)s="complete";}t.put("status",s);return t;}
    static JSONArray list(Context c)throws Exception{synchronized(LOCK){JSONArray a=read(c),out=new JSONArray();for(int i=0;i<a.length();i++){JSONObject t=normalize(c,a.getJSONObject(i));if(!status(t).equals("ready"))out.put(t);}return out;}}
    private static JSONArray recents(Context c)throws Exception{String stored=prefs(c).getString("timer_recents_v2",null);if(stored!=null)return new JSONArray(stored);JSONArray old=new JSONArray(prefs(c).getString("timer_history","[]")),out=new JSONArray();for(int i=0;i<old.length();i++)if(old.optInt(i)>0)out.put(NetEaseClient.obj("duration",old.getInt(i),"label","计时器","sound","bell"));return out;}
    private static void remember(Context c,JSONObject t)throws Exception{JSONArray old=recents(c),out=new JSONArray();out.put(NetEaseClient.obj("duration",t.getInt("total"),"label",t.getString("label"),"sound",t.optString("sound","bell")));for(int i=0;i<old.length()&&out.length()<8;i++){JSONObject v=old.getJSONObject(i);if(v.optInt("duration")!=t.optInt("total")||!v.optString("label").equals(t.optString("label")))out.put(v);}if(!prefs(c).edit().putString("timer_recents_v2",out.toString()).commit())throw new IllegalStateException("最近计时未保存");}
    static JSONObject state(Context c)throws Exception{synchronized(LOCK){JSONArray a=read(c),all=new JSONArray();JSONObject p=null;for(int i=0;i<a.length();i++){JSONObject v=normalize(c,a.getJSONObject(i));all.put(v);if(v.optString("id").equals("primary"))p=v;}return NetEaseClient.obj("ok",true,"timer",p==null?initial():p,"timers",all,"recents",recents(c),"history",new JSONArray(prefs(c).getString("timer_history","[]")));}}
    static JSONObject change(Context c,JSONObject b)throws Exception{synchronized(LOCK){JSONArray a=read(c);String action=b.optString("action");if(action.equals("recent-remove")){JSONArray old=recents(c),out=new JSONArray();int index=b.optInt("index",-1);if(index<0||index>=old.length())throw new IllegalArgumentException("最近记录不存在");for(int i=0;i<old.length();i++)if(i!=index)out.put(old.get(i));if(!prefs(c).edit().putString("timer_recents_v2",out.toString()).commit())throw new IllegalStateException("最近计时未保存");return state(c);}String id=b.optString("id","primary");JSONObject t=null;int at=-1;for(int i=0;i<a.length();i++)if(a.getJSONObject(i).optString("id").equals(id)){t=normalize(c,a.getJSONObject(i));at=i;break;}
        if(action.equals("cancel")){JSONArray out=new JSONArray();for(int i=0;i<a.length();i++)if(!a.getJSONObject(i).optString("id").equals(id))out.put(a.getJSONObject(i));save(c,out);cancel(c,id);return state(c);}
        if(t==null){if(!id.equals("primary")&& !action.equals("start"))throw new IllegalArgumentException("计时器不存在");t=initial();t.put("id",id);}
        if(action.equals("metadata")){if(at<0)throw new IllegalArgumentException("计时器不存在");String label=b.optString("label",t.optString("label","计时器")).trim(),sound=b.optString("sound",t.optString("sound","bell"));if(!sound.equals("bell")&&!sound.equals("none"))throw new IllegalArgumentException("提示音无效");t.put("label",label.isEmpty()?"计时器":label.substring(0,Math.min(24,label.length()))).put("sound",sound);a.put(at,t);save(c,a);return state(c);}
        if(action.equals("configure")||action.equals("start")){
            int sec=b.optInt("seconds");if(sec<1||sec>86399)throw new IllegalArgumentException("时长须为 1 秒至 23 小时 59 分 59 秒");
            if(action.equals("start")&&!b.has("id")){if(a.length()>=6)throw new IllegalArgumentException("最多同时保留六个计时器");id=UUID.randomUUID().toString().substring(0,8);t=initial();t.put("id",id);at=-1;}
            String label=b.optString("label","自定义计时"),sound=b.optString("sound","bell");if(!sound.equals("bell")&&!sound.equals("none"))throw new IllegalArgumentException("提示音无效");t.put("sound",sound).put("total",sec).put("remaining",sec).put("label",label.substring(0,Math.min(24,label.length()))).put("status",action.equals("start")?"running":"ready").put("ends",action.equals("start")?now()+sec:0).put("notified",false);if(action.equals("start"))deadline(c,t,sec);
        }else if(action.equals("pause")){
            if(status(t).equals("running"))t.put("remaining",left(c,t)).put("status","paused").put("ends",0);
        }else if(action.equals("resume")){
            if(!status(t).equals("running")){double remaining=t.optDouble("remaining",t.optInt("total",300));if(remaining<=0||status(t).equals("complete"))remaining=t.optInt("total",300);t.put("remaining",remaining).put("status","running").put("notified",false);deadline(c,t,remaining);}
        }else if(action.equals("reset")){t.put("status","ready").put("remaining",t.optInt("total",300)).put("ends",0).put("notified",false);}
        else if(action.equals("ack")){t.put("notified",true).put("status","ready").put("ends",0).put("remaining",t.optInt("total",300));}
        else throw new IllegalArgumentException("无效的计时器操作");
        if(at<0)a.put(t);else a.put(at,t);save(c,a);cancel(c,id);if(status(t).equals("complete")&&!t.optBoolean("notified"))fire(c,id);if(status(t).equals("running")){arm(c,t);if(action.equals("start")||action.equals("resume"))remember(c,t);JSONArray old=new JSONArray(prefs(c).getString("timer_history","[]")),h=new JSONArray();h.put(t.optInt("total"));for(int i=0;i<old.length()&&h.length()<3;i++)if(old.optInt(i)!=t.optInt("total"))h.put(old.optInt(i));prefs(c).edit().putString("timer_history",h.toString()).commit();}
        JSONObject response=state(c);response.put("timer",t);return response;
    }}
    private static PendingIntent pending(Context c,String id){Intent i=new Intent(c,TimerAlarmReceiver.class).setAction("dev.pro8.homeview.TIMER").setData(Uri.parse("homeview-timer:"+id)).putExtra("timer_id",id);return PendingIntent.getBroadcast(c,0,i,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);}
    private static void cancel(Context c,String id){((AlarmManager)c.getSystemService(Context.ALARM_SERVICE)).cancel(pending(c,id));((NotificationManager)c.getSystemService(Context.NOTIFICATION_SERVICE)).cancel(id.hashCode());}
    private static void arm(Context c,JSONObject t){PendingIntent show=PendingIntent.getActivity(c,41,HomeActivity.homeIntent(c).putExtra("homeview_timer",true),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);((AlarmManager)c.getSystemService(Context.ALARM_SERVICE)).setAlarmClock(new AlarmManager.AlarmClockInfo(System.currentTimeMillis()+Math.max(50,(long)(left(c,t)*1000)),show),pending(c,t.optString("id")));}
    static void restore(Context c){synchronized(LOCK){try{JSONArray a=read(c);for(int i=0;i<a.length();i++){JSONObject t=a.getJSONObject(i);if(status(t).equals("running")){if(t.optInt("boot",-1)!=boot(c)){deadline(c,t,left(c,t));save(c,a);}arm(c,t);}else if(status(t).equals("complete")&&!t.optBoolean("notified"))fire(c,t.optString("id"));}}catch(Exception e){android.util.Log.w("HomeViewTimer","计时恢复暂时失败");}}}
    static void fire(Context c,String id){synchronized(LOCK){try{JSONArray a=read(c);for(int i=0;i<a.length();i++){JSONObject t=a.getJSONObject(i);if(!id.equals(t.optString("id"))||status(t).equals("paused")||status(t).equals("ready")||t.optBoolean("notified"))continue;if(left(c,t)>.1){arm(c,t);return;}t.put("status","complete").put("remaining",0).put("ends",now()).put("notified",true);save(c,a);
            NotificationManager nm=(NotificationManager)c.getSystemService(Context.NOTIFICATION_SERVICE);boolean silent=t.optString("sound","bell").equals("none");String channelId=silent?"homeview-timers-silent":"homeview-timers-v77";NotificationChannel channel=new NotificationChannel(channelId,silent?"无声计时提醒":"计时提醒",NotificationManager.IMPORTANCE_HIGH);channel.setSound(silent?null:ClockRingingService.fallback(c),new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).build());channel.enableVibration(!silent);nm.createNotificationChannel(channel);
            Intent home=HomeActivity.homeIntent(c).setData(Uri.parse("homeview-timer-open:"+id)).putExtra("homeview_timer",true).putExtra("timer_id",id);PendingIntent open=PendingIntent.getActivity(c,41,home,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
            nm.notify(id.hashCode(),new Notification.Builder(c,channelId).setSmallIcon(android.R.drawable.ic_lock_idle_alarm).setContentTitle("时间到").setContentText(t.optString("label","计时器")+" 已完成").setCategory(Notification.CATEGORY_ALARM).setContentIntent(open).setAutoCancel(true).build());return;
        }}catch(Exception e){android.util.Log.w("HomeViewTimer","计时提醒暂时失败");}}}
}
