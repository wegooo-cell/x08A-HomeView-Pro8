package dev.pro8.homeview.direct;
import android.app.*;
import android.content.*;
import android.media.*;
import android.net.Uri;
import android.os.*;
import org.json.JSONObject;
/** One bounded alarm audio session, shared by queued alarms. */
public final class ClockRingingService extends Service {
    static Uri fallback(Context c){return Uri.parse("android.resource://"+c.getPackageName()+"/raw/clock_alarm");}
    private static volatile MediaPlayer player;private AudioManager audio;private AudioFocusRequest focus;private final Handler handler=new Handler(Looper.getMainLooper());
    static boolean isPlaying(){try{return player!=null&&player.isPlaying();}catch(Exception e){return false;}}
    private PendingIntent action(String name,String id){return PendingIntent.getBroadcast(this,name.hashCode(),new Intent(this,ClockAlarmReceiver.class).setAction("dev.pro8.homeview.CLOCK_"+name).setData(Uri.parse("homeview-clock-action:"+name+":"+id)).putExtra("alarm_id",id),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);}
    @Override public int onStartCommand(Intent i,int flags,int startId){try{JSONObject r=LocalClock.firstRing(this);if(r==null){stopSelf();return START_NOT_STICKY;}NotificationManager nm=(NotificationManager)getSystemService(NOTIFICATION_SERVICE);NotificationChannel ch=new NotificationChannel("homeview-clock-alarms","闹钟",NotificationManager.IMPORTANCE_HIGH);ch.setSound(null,null);nm.createNotificationChannel(ch);PendingIntent open=PendingIntent.getActivity(this,73,HomeActivity.homeIntent(this).putExtra("homeview_alarm",true),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder n=new Notification.Builder(this,"homeview-clock-alarms").setSmallIcon(android.R.drawable.ic_lock_idle_alarm).setContentTitle(r.optString("label","闹钟")).setContentText(r.optString("time")+" · 闹钟响起").setCategory(Notification.CATEGORY_ALARM).setOngoing(true).setContentIntent(open).setFullScreenIntent(open,true).addAction(new Notification.Action.Builder(null,"停止",action("DISMISS",r.getString("id"))).build());if(r.optBoolean("snooze"))n.addAction(new Notification.Action.Builder(null,"稍后提醒",action("SNOOZE",r.getString("id"))).build());startForeground(7301,n.build());
        if(player==null){audio=(AudioManager)getSystemService(AUDIO_SERVICE);AudioAttributes attr=new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build();focus=new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT).setAudioAttributes(attr).setOnAudioFocusChangeListener(new AudioManager.OnAudioFocusChangeListener(){public void onAudioFocusChange(int change){}}).build();audio.requestAudioFocus(focus);MediaPlayer p=new MediaPlayer();player=p;p.setAudioAttributes(attr);p.setDataSource(this,fallback(this));p.prepare();p.setLooping(true);p.setWakeMode(this,PowerManager.PARTIAL_WAKE_LOCK);player=p;p.start();PowerManager pm=(PowerManager)getSystemService(POWER_SERVICE);PowerManager.WakeLock wake=pm.newWakeLock(PowerManager.SCREEN_BRIGHT_WAKE_LOCK|PowerManager.ACQUIRE_CAUSES_WAKEUP,"HomeView:clock-alarm");wake.acquire(10000);startActivity(HomeActivity.homeIntent(this).putExtra("homeview_alarm",true));}
        handler.removeCallbacksAndMessages(null);handler.postDelayed(new Runnable(){public void run(){LocalClock.expireRings(ClockRingingService.this);}},Math.max(100,120000-(System.currentTimeMillis()-r.optLong("fired"))));return START_NOT_STICKY;
    }catch(Exception e){android.util.Log.w("HomeViewClock","闹钟音频暂时不可用");stopSelf();return START_NOT_STICKY;}}
    @Override public void onDestroy(){handler.removeCallbacksAndMessages(null);MediaPlayer p=player;player=null;if(p!=null){try{p.stop();}catch(Exception ignored){}p.release();}if(audio!=null&&focus!=null)audio.abandonAudioFocusRequest(focus);super.onDestroy();}
    @Override public IBinder onBind(Intent i){return null;}
}
