package dev.pro8.homeview.direct;

import android.app.*;
import android.content.*;
import android.net.Uri;
import android.os.SystemClock;
import org.json.*;
import java.util.*;

/** Clock records, stopwatch elapsed time and wake-up alarms; never a WebView timer. */
final class LocalClock {
    private static final Object LOCK=new Object();
    private static final String[] CITIES={"beijing","tokyo","london","newyork","sydney","paris","losangeles","singapore","dubai","berlin","hongkong","shanghai"};
    private static android.content.SharedPreferences prefs(Context c){return c.getSharedPreferences("homeview_clock",0);}
    private static JSONArray alarms(Context c)throws Exception{return new JSONArray(prefs(c).getString("alarms","[]"));}
    private static JSONArray rings(Context c)throws Exception{return new JSONArray(prefs(c).getString("ringing","[]"));}
    private static void put(Context c,String k,Object value){if(!prefs(c).edit().putString(k,value.toString()).commit())throw new IllegalStateException("时钟设置未能保存");}
    private static int boot(Context c){return android.provider.Settings.Global.getInt(c.getContentResolver(),"boot_count",0);}
    private static JSONObject watch(Context c)throws Exception{return new JSONObject(prefs(c).getString("stopwatch","{\"running\":false,\"accum\":0,\"laps\":[]}"));}
    private static double watchElapsed(Context c,JSONObject s){if(!s.optBoolean("running"))return s.optDouble("accum");double d=s.optInt("boot",-1)==boot(c)?SystemClock.elapsedRealtime()-s.optDouble("mono"):System.currentTimeMillis()-s.optDouble("wall");return s.optDouble("accum")+Math.max(0,d);}
    private static JSONObject find(JSONArray a,String id){for(int i=0;i<a.length();i++)if(a.optJSONObject(i)!=null&&id.equals(a.optJSONObject(i).optString("id")))return a.optJSONObject(i);return null;}
    private static String text(JSONObject b,String key,String fallback){String s=b.optString(key,fallback).trim();return s.isEmpty()?fallback:s.substring(0,Math.min(24,s.length()));}
    private static String validTime(String time){if(!time.matches("(?:[01][0-9]|2[0-3]):[0-5][0-9]"))throw new IllegalArgumentException("请选择有效的闹钟时间");return time;}
    private static String validRepeat(String r){if(!Arrays.asList("once","weekdays","weekend","everyday").contains(r))throw new IllegalArgumentException("重复方式无效");return r;}
    static long nextOccurrence(long now,String time,String repeat,TimeZone zone){
        validTime(time);validRepeat(repeat);Calendar base=Calendar.getInstance(zone);base.setTimeInMillis(now);String[] hm=time.split(":");
        for(int d=0;d<8;d++){Calendar n=(Calendar)base.clone();n.add(Calendar.DAY_OF_YEAR,d);n.set(Calendar.HOUR_OF_DAY,Integer.parseInt(hm[0]));n.set(Calendar.MINUTE,Integer.parseInt(hm[1]));n.set(Calendar.SECOND,0);n.set(Calendar.MILLISECOND,0);int day=n.get(Calendar.DAY_OF_WEEK);boolean work=day!=Calendar.SATURDAY&&day!=Calendar.SUNDAY;
            if(n.getTimeInMillis()>now&&(repeat.equals("once")||repeat.equals("everyday")||repeat.equals("weekdays")&&work||repeat.equals("weekend")&&!work))return n.getTimeInMillis();}
        throw new IllegalArgumentException("未能安排下一次闹钟");
    }
    private static Intent broadcast(Context c,String id,boolean snooze){return new Intent(c,ClockAlarmReceiver.class).setAction("dev.pro8.homeview.CLOCK_FIRE").setData(Uri.parse("homeview-alarm:"+id+(snooze?":snooze":":normal"))).putExtra("alarm_id",id).putExtra("snooze_alarm",snooze);}
    private static PendingIntent pending(Context c,String id,boolean snooze,long at){return PendingIntent.getBroadcast(c,0,broadcast(c,id,snooze).putExtra("expected_at",at),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);}
    private static PendingIntent show(Context c){return PendingIntent.getActivity(c,73,HomeActivity.homeIntent(c).putExtra("homeview_alarm",true),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);}
    private static void arm(Context c,JSONObject a,boolean snooze){long at=a.optLong(snooze?"snooze_at":"next");if(at<=0)return;((AlarmManager)c.getSystemService(Context.ALARM_SERVICE)).setAlarmClock(new AlarmManager.AlarmClockInfo(at,show(c)),pending(c,a.optString("id"),snooze,at));}
    private static void cancel(Context c,String id){AlarmManager am=(AlarmManager)c.getSystemService(Context.ALARM_SERVICE);am.cancel(pending(c,id,false,0));am.cancel(pending(c,id,true,0));}
    private static void unring(Context c,String id)throws Exception{JSONArray old=rings(c),next=new JSONArray();for(int i=0;i<old.length();i++)if(!id.equals(old.getJSONObject(i).optString("id")))next.put(old.getJSONObject(i));put(c,"ringing",next);}
    private static void service(Context c)throws Exception{if(rings(c).length()>0)c.startForegroundService(new Intent(c,ClockRingingService.class));else c.stopService(new Intent(c,ClockRingingService.class));}
    static JSONObject firstRing(Context c)throws Exception{synchronized(LOCK){return rings(c).optJSONObject(0);}}
    static JSONObject state(Context c)throws Exception{synchronized(LOCK){JSONObject s=watch(c);JSONObject view=NetEaseClient.obj("running",s.optBoolean("running"),"elapsed",watchElapsed(c,s),"laps",s.optJSONArray("laps")==null?new JSONArray():s.getJSONArray("laps"));return NetEaseClient.obj("ok",true,"cities",new JSONArray(prefs(c).getString("cities","[\"beijing\",\"tokyo\",\"london\",\"newyork\",\"sydney\"]")),"alarms",alarms(c),"stopwatch",view,"ringing",rings(c),"audio_active",ClockRingingService.isPlaying(),"timezone",TimeZone.getDefault().getID());}}
    static JSONObject command(Context c,JSONObject b)throws Exception{synchronized(LOCK){String action=b.optString("action"),id=b.optString("id");JSONArray all=alarms(c);JSONObject a=find(all,id);long now=System.currentTimeMillis();
        if(action.equals("cities")){JSONArray input=b.getJSONArray("ids"),out=new JSONArray();Set<String> used=new HashSet<>();for(int i=0;i<input.length();i++){String city=input.getString(i);if(!Arrays.asList(CITIES).contains(city)||!used.add(city))throw new IllegalArgumentException("城市无效");out.put(city);}put(c,"cities",out);
        }else if(action.equals("alarm-save")){String time=validTime(b.optString("time")),repeat=validRepeat(b.optString("repeat","once"));if(a==null){if(!id.isEmpty())throw new IllegalArgumentException("闹钟不存在");if(all.length()>=32)throw new IllegalArgumentException("最多保存32个闹钟");a=new JSONObject();a.put("id",UUID.randomUUID().toString().substring(0,8));all.put(a);}a.put("time",time).put("repeat",repeat).put("label",text(b,"label","闹钟")).put("snooze",b.optBoolean("snooze",true)).put("enabled",b.optBoolean("enabled",true)).put("snooze_at",0);a.put("next",a.optBoolean("enabled")?nextOccurrence(now,a.getString("time"),a.getString("repeat"),TimeZone.getDefault()):0);put(c,"alarms",all);cancel(c,a.optString("id"));unring(c,a.optString("id"));if(a.optBoolean("enabled"))arm(c,a,false);service(c);
        }else if(action.equals("alarm-toggle")){if(a==null)throw new IllegalArgumentException("闹钟不存在");cancel(c,id);unring(c,id);boolean on=b.optBoolean("enabled");a.put("enabled",on).put("snooze_at",0).put("next",on?nextOccurrence(now,a.getString("time"),a.getString("repeat"),TimeZone.getDefault()):0);put(c,"alarms",all);if(on)arm(c,a,false);service(c);
        }else if(action.equals("alarm-delete")){cancel(c,id);unring(c,id);JSONArray kept=new JSONArray();for(int i=0;i<all.length();i++)if(!id.equals(all.getJSONObject(i).optString("id")))kept.put(all.getJSONObject(i));put(c,"alarms",kept);service(c);
        }else if(action.equals("alarm-dismiss")||action.equals("alarm-snooze")){JSONObject active=find(rings(c),id);if(active==null)return state(c);unring(c,id);if(action.equals("alarm-snooze")&&a!=null&&a.optBoolean("snooze")){a.put("snooze_at",now+9*60000L);put(c,"alarms",all);arm(c,a,true);}service(c);
        }else if(action.startsWith("sw-")){JSONObject s=watch(c);double elapsed=watchElapsed(c,s);boolean running=s.optBoolean("running");if(action.equals("sw-start")){if(!running)s.put("running",true).put("mono",SystemClock.elapsedRealtime()).put("wall",now).put("boot",boot(c));}else if(action.equals("sw-stop")){s.put("accum",elapsed).put("running",false);}else if(action.equals("sw-reset")){if(running)throw new IllegalArgumentException("请先停止秒表");s=NetEaseClient.obj("running",false,"accum",0,"laps",new JSONArray());}else if(action.equals("sw-lap")){if(!running)throw new IllegalArgumentException("请先开始秒表");JSONArray laps=s.optJSONArray("laps");if(laps==null)laps=new JSONArray();if(laps.length()>=100)throw new IllegalArgumentException("最多记录100次计次");double total=0;for(int i=0;i<laps.length();i++)total+=laps.getDouble(i);laps.put(Math.max(0,elapsed-total));s.put("laps",laps);}else throw new IllegalArgumentException("秒表操作无效");put(c,"stopwatch",s);
        }else throw new IllegalArgumentException("时钟操作无效");return state(c);
    }}
    static void fire(Context c,String id,boolean snooze,long expected){synchronized(LOCK){try{JSONArray all=alarms(c);JSONObject a=find(all,id);if(a==null)return;String field=snooze?"snooze_at":"next";long at=a.optLong(field),now=System.currentTimeMillis();if(at<=0||at!=expected||!snooze&&!a.optBoolean("enabled"))return;if(at>now+250){arm(c,a,snooze);return;}a.put(field,0);if(!snooze){if(a.optString("repeat").equals("once"))a.put("enabled",false);else{a.put("next",nextOccurrence(now,a.getString("time"),a.getString("repeat"),TimeZone.getDefault()));arm(c,a,false);}}put(c,"alarms",all);JSONArray active=rings(c);if(find(active,id)==null){active.put(NetEaseClient.obj("id",id,"label",a.optString("label","闹钟"),"time",a.optString("time"),"snooze",a.optBoolean("snooze"),"fired",now));put(c,"ringing",active);}service(c);}catch(Exception e){android.util.Log.w("HomeViewClock","闹钟提醒暂时失败");}}}
    static void expireRings(Context c){synchronized(LOCK){try{JSONArray old=rings(c),out=new JSONArray();long now=System.currentTimeMillis();for(int i=0;i<old.length();i++){JSONObject r=old.getJSONObject(i);if(now-r.optLong("fired")<120000)out.put(r);}put(c,"ringing",out);service(c);}catch(Exception ignored){}}}
    static void restore(Context c,boolean timeChanged){synchronized(LOCK){try{
        expireRings(c);JSONArray all=alarms(c),due=new JSONArray();long now=System.currentTimeMillis();
        for(int i=0;i<all.length();i++){JSONObject a=all.getJSONObject(i);long snooze=a.optLong("snooze_at"),next=a.optLong("next");
            if(snooze>0){if(snooze>now)arm(c,a,true);else if(now-snooze<300000)due.put(NetEaseClient.obj("id",a.getString("id"),"snooze",true,"at",snooze));else a.put("snooze_at",0);}
            if(a.optBoolean("enabled")){if(!timeChanged&&next>0&&next<=now&&now-next<300000)due.put(NetEaseClient.obj("id",a.getString("id"),"snooze",false,"at",next));else{a.put("next",nextOccurrence(now,a.getString("time"),a.getString("repeat"),TimeZone.getDefault()));arm(c,a,false);}}
        }
        put(c,"alarms",all);for(int i=0;i<due.length();i++){JSONObject d=due.getJSONObject(i);fire(c,d.getString("id"),d.getBoolean("snooze"),d.getLong("at"));}
    }catch(Exception e){android.util.Log.w("HomeViewClock","闹钟恢复暂时失败");}}}
}
