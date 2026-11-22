package dev.pro8.homeview.direct;
import android.app.*;
import android.content.*;
import android.os.IBinder;
/** Foreground lifetime only while the user has enabled the AirPlay receiver. */
public final class AirPlayService extends Service {
    @Override public void onCreate(){super.onCreate();NotificationManager nm=(NotificationManager)getSystemService(NOTIFICATION_SERVICE);nm.createNotificationChannel(new NotificationChannel("airplay","AirPlay 接收",NotificationManager.IMPORTANCE_LOW));Intent open=new Intent(this,HomeActivity.class).setAction(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME);PendingIntent pi=PendingIntent.getActivity(this,88,open,PendingIntent.FLAG_UPDATE_CURRENT);startForeground(88,new Notification.Builder(this,"airplay").setSmallIcon(android.R.drawable.ic_media_play).setContentTitle("HomeView AirPlay").setContentText("从 iPhone 或 Mac 选择 HomeView Pro8").setContentIntent(pi).setOngoing(true).build());}
    @Override public int onStartCommand(Intent intent,int flags,int id){((HomeViewApplication)getApplication()).airplay().start();return START_NOT_STICKY;}
    @Override public void onDestroy(){((HomeViewApplication)getApplication()).airplay().stop();super.onDestroy();}
    @Override public IBinder onBind(Intent intent){return null;}
}
