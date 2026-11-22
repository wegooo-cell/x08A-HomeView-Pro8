package dev.pro8.homeview.direct;

import android.content.*;
import android.graphics.*;
import android.media.AudioManager;
import android.net.nsd.*;
import android.net.wifi.WifiManager;
import android.os.*;
import io.github.jqssun.airplay.bridge.NativeBridge;
import org.json.*;
import java.io.*;
import java.util.*;
import java.util.concurrent.*;

/** On-demand local AirPlay audio. No Xiaomi account, Mac service or exported control API. GPL-3.0 adapter. */
public final class LocalAirPlay {
    static final String NAME="HomeView Pro8";
    private final Context context;private final AudioManager audio;private final NsdManager nsd;
    private final AirPlayRemote remote;private volatile boolean remotePaused;
    private final ExecutorService worker=Executors.newSingleThreadExecutor();
    private final ArrayList<NsdManager.RegistrationListener> registrations=new ArrayList<>();
    private final Object metadata=new Object();
    private volatile long handle;private volatile boolean enabled,starting,streaming;private volatile int connections,advertised,epoch;private volatile String error="",pin="";private volatile float clientDb=-6;private volatile boolean pausedForFocus;
    private final AudioManager.OnAudioFocusChangeListener focus;
    private WifiManager.MulticastLock multicast;private PowerManager.WakeLock wake;
    private String title="",artist="",album="";private long artVersion,position,duration,progressAt;private byte[] cover,ambient;
    LocalAirPlay(Context c){remote=new AirPlayRemote(c);context=c.getApplicationContext();audio=(AudioManager)c.getSystemService(Context.AUDIO_SERVICE);nsd=(NsdManager)c.getSystemService(Context.NSD_SERVICE);focus=change->{long h=handle;if(h==0)return;if(change==AudioManager.AUDIOFOCUS_GAIN){if(pausedForFocus){pausedForFocus=false;streaming=NativeBridge.nativeServerAudioStart(h);}NativeBridge.nativeServerAudioSetClientGain(h,gain(clientDb));}else if(change==AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK){NativeBridge.nativeServerAudioSetClientGain(h,gain(clientDb)*.25f);}else{pausedForFocus=streaming;streaming=false;NativeBridge.nativeServerAudioStop(h);}};}
    private static float gain(float db){return db<=-144?0:(float)Math.pow(10,Math.max(-30,Math.min(0,db))/20.0);}
    JSONObject state()throws Exception{synchronized(metadata){long elapsed=streaming&&!remotePaused&&progressAt>0?Math.max(0,SystemClock.elapsedRealtime()-progressAt):0;return NetEaseClient.obj("ok",true,"enabled",enabled,"starting",starting,"ready",enabled&&advertised>=2,"streaming",streaming,"playing",streaming&&!remotePaused,"remote_available",enabled&&remote.ready(),"connections",connections,"name",NAME,"error",error,"pin",pin,"title",title,"artist",artist,"album",album,"art_version",cover==null?0:artVersion,"position_ms",duration>0?Math.min(duration,position+elapsed):position+elapsed,"duration_ms",duration);}}
    byte[] artwork(boolean blur)throws IOException{synchronized(metadata){byte[] b=blur?ambient:cover;if(b==null)throw new FileNotFoundException();return b;}}
    void start(){worker.execute(()->{if(enabled||starting)return;starting=true;error="";try{
        WifiManager wifi=(WifiManager)context.getSystemService(Context.WIFI_SERVICE);multicast=wifi.createMulticastLock("homeview-airplay");multicast.setReferenceCounted(false);multicast.acquire();
        PowerManager pm=(PowerManager)context.getSystemService(Context.POWER_SERVICE);wake=pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK,"homeview:airplay");wake.acquire();
        NativeBridge.nativeSetDefaultStreamValues(property(AudioManager.PROPERTY_OUTPUT_SAMPLE_RATE),property(AudioManager.PROPERTY_OUTPUT_FRAMES_PER_BUFFER));
        String identity=context.getSharedPreferences("homeview_pro8",0).getString("airplay_identity","");if(identity.length()!=12){byte[] b=new byte[6];new java.security.SecureRandom().nextBytes(b);b[0]=(byte)((b[0]&0xfe)|2);StringBuilder s=new StringBuilder();for(byte v:b)s.append(String.format(Locale.US,"%02X",v));identity=s.toString();context.getSharedPreferences("homeview_pro8",0).edit().putString("airplay_identity",identity).commit();}
        byte[] addr=new byte[6];for(int i=0;i<6;i++)addr[i]=(byte)Integer.parseInt(identity.substring(i*2,i*2+2),16);
        long h=NativeBridge.nativeInit(this,addr,NAME,new File(context.getFilesDir(),"homeview-airplay.pem").getAbsolutePath(),false,false);if(h==0)throw new IOException();handle=h;
        NativeBridge.nativeSetH265Enabled(h,false);NativeBridge.nativeSetCodecs(h,true,true);NativeBridge.nativeSetHlsEnabled(h,false);NativeBridge.nativeSetFeature(h,7,false);NativeBridge.nativeSetFeature(h,9,true);NativeBridge.nativeSetDisplaySize(h,1280,800,30);
        NativeBridge.nativeServerAudioConfigure(h,150,95,0,true,false,false,false,false);NativeBridge.nativeServerAudioSetClientGain(h,gain(clientDb));
        int port=NativeBridge.nativeStart(h,7100);if(port<=0)throw new IOException();enabled=true;++epoch;
        register(NativeBridge.nativeGetRaopServiceName(h),"_raop._tcp.",port,NativeBridge.nativeGetRaopTxtRecords(h));register(NAME,"_airplay._tcp.",port,NativeBridge.nativeGetAirplayTxtRecords(h));
    }catch(Throwable failure){error="AirPlay 启动失败，请检查 Wi-Fi 后重试";shutdown();android.util.Log.w("HomeViewAirPlay","Start failed: "+failure.getClass().getSimpleName());}finally{starting=false;}});}
    private int property(String key){try{return Integer.parseInt(audio.getProperty(key));}catch(Exception e){return 0;}}
    private void register(String name,String type,int port,Map<String,String> txt){final int registrationEpoch=epoch;NsdServiceInfo info=new NsdServiceInfo();info.setServiceName(name==null?NAME:name);info.setServiceType(type);info.setPort(port);if(txt!=null)for(Map.Entry<String,String> entry:txt.entrySet())info.setAttribute(entry.getKey(),entry.getValue());NsdManager.RegistrationListener listener=new NsdManager.RegistrationListener(){public void onServiceRegistered(NsdServiceInfo s){if(enabled&&registrationEpoch==epoch)advertised++;}public void onRegistrationFailed(NsdServiceInfo s,int code){if(!enabled||registrationEpoch!=epoch)return;error="局域网发现暂不可用，请重新开启 AirPlay";}public void onServiceUnregistered(NsdServiceInfo s){}public void onUnregistrationFailed(NsdServiceInfo s,int code){}};registrations.add(listener);nsd.registerService(info,NsdManager.PROTOCOL_DNS_SD,listener);}
    void stop(){worker.execute(this::shutdown);}
    private void shutdown(){remote.reset();remotePaused=false;++epoch;enabled=false;streaming=false;long h=handle;handle=0;for(NsdManager.RegistrationListener r:registrations)try{nsd.unregisterService(r);}catch(Exception ignored){}registrations.clear();advertised=0;if(h!=0){NativeBridge.nativeStop(h);NativeBridge.nativeDestroy(h);}if(multicast!=null&&multicast.isHeld())multicast.release();multicast=null;if(wake!=null&&wake.isHeld())wake.release();wake=null;connections=0;pin="";synchronized(metadata){title="";artist="";album="";cover=null;ambient=null;position=duration=progressAt=0;}pausedForFocus=false;audio.abandonAudioFocus(focus);}
    public void onLog(String message){/* Never forward native protocol logs or sender metadata. */}
    public void onAudioFormat(int ct,int spf,boolean screen){remotePaused=false;long h=handle;if(h==0)return;if(audio.requestAudioFocus(focus,AudioManager.STREAM_MUSIC,AudioManager.AUDIOFOCUS_GAIN)!=AudioManager.AUDIOFOCUS_REQUEST_GRANTED){error="其他应用正在使用音频，请稍后重新连接";return;}NativeBridge.nativeServerAudioFormat(h,ct,spf);if(NativeBridge.nativeServerAudioStart(h)){streaming=true;pin="";}else error="音频输出启动失败，请重新连接";}
    public void onAudioTeardown(){synchronized(metadata){if(streaming&&!remotePaused&&progressAt>0)position=Math.min(duration>0?duration:Long.MAX_VALUE,position+Math.max(0,SystemClock.elapsedRealtime()-progressAt));progressAt=0;}long h=handle;streaming=false;if(h!=0)NativeBridge.nativeServerAudioStop(h);pausedForFocus=false;audio.abandonAudioFocus(focus);}
    public void onConnectionInit(){connections++;}
    public void onConnectionDestroy(){connections=Math.max(0,connections-1);if(connections==0){remote.reset();remotePaused=false;onAudioTeardown();synchronized(metadata){title="";artist="";album="";cover=null;ambient=null;position=duration=progressAt=0;}}}
    public void onConnectionReset(int reason){}
    public void onClientVolume(float db){clientDb=db;long h=handle;if(h!=0)NativeBridge.nativeServerAudioSetClientGain(h,gain(db));}
    public float onClientVolumeQuery(){return clientDb;}
    public void onMetadata(byte[] bytes){if(bytes==null||bytes.length>65536)return;Map<String,String> values=new HashMap<>();parse(bytes,0,bytes.length,0,values);synchronized(metadata){if(values.containsKey("minm"))title=values.get("minm");if(values.containsKey("asar"))artist=values.get("asar");if(values.containsKey("asal"))album=values.get("asal");}}
    private void parse(byte[] b,int start,int end,int depth,Map<String,String> out){if(depth>5)return;for(int p=start;p+8<=end;){String tag;try{tag=new String(b,p,4,"US-ASCII");}catch(Exception e){return;}long n=((b[p+4]&255L)<<24)|((b[p+5]&255L)<<16)|((b[p+6]&255L)<<8)|(b[p+7]&255L);p+=8;if(n>end-p)return;int count=(int)n;if(tag.equals("mlit")||tag.equals("mcon")||tag.equals("mlcl"))parse(b,p,p+count,depth+1,out);else if(tag.equals("minm")||tag.equals("asar")||tag.equals("asal"))try{String text=new String(b,p,Math.min(count,1024),"UTF-8").replaceAll("[\\p{Cntrl}]","");out.put(tag,text.substring(0,Math.min(256,text.length())));}catch(Exception ignored){}p+=count;}}
    public void onCoverArt(byte[] bytes){if(bytes==null||bytes.length<8||bytes.length>2*1024*1024)return;try{BitmapFactory.Options o=new BitmapFactory.Options();o.inJustDecodeBounds=true;BitmapFactory.decodeByteArray(bytes,0,bytes.length,o);if(o.outWidth<1||o.outHeight<1||o.outWidth>8192||o.outHeight>8192)return;o.inSampleSize=1;while(Math.max(o.outWidth,o.outHeight)/o.inSampleSize>512)o.inSampleSize*=2;o.inJustDecodeBounds=false;Bitmap b=BitmapFactory.decodeByteArray(bytes,0,bytes.length,o);if(b==null)return;ByteArrayOutputStream out=new ByteArrayOutputStream();b.compress(Bitmap.CompressFormat.JPEG,86,out);Bitmap small=Bitmap.createScaledBitmap(b,48,48,true);ByteArrayOutputStream amb=new ByteArrayOutputStream();small.compress(Bitmap.CompressFormat.JPEG,72,amb);small.recycle();b.recycle();synchronized(metadata){cover=out.toByteArray();ambient=amb.toByteArray();artVersion++;}}catch(Exception ignored){}}
    public void onProgress(long start,long current,long end){synchronized(metadata){position=Math.max(0,(current-start)*1000/44100);duration=Math.max(0,(end-start)*1000/44100);progressAt=SystemClock.elapsedRealtime();}}
    public void onDisplayPin(String value){pin=value==null?"":value;}
    public void onDacpId(String id,String auth){if(enabled)remote.update(id,auth);}
    JSONObject control(String action)throws Exception{
        if(!enabled)throw new IllegalArgumentException("请先开启 AirPlay");
        remote.send(action);
        if(action.equals("play")||action.equals("pause"))synchronized(metadata){
            long now=SystemClock.elapsedRealtime();
            if(streaming&&!remotePaused&&progressAt>0)position=Math.min(duration>0?duration:Long.MAX_VALUE,position+Math.max(0,now-progressAt));
            remotePaused=action.equals("pause");progressAt=now;
        }
        return state();
    }
    public void onVideoData(byte[] b,long t,boolean h265){}
    public void onVideoSize(float a,float b,float c,float d){}
    public void onMirrorRunning(boolean running){}
    public void onVideoPlay(String location,float start){}
    public void onVideoScrub(float p){}
    public void onVideoRate(float r){}
    public void onVideoStop(){}
    public void onVideoSessionPoll(){}
}
