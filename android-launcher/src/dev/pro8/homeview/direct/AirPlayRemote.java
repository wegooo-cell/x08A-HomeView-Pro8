package dev.pro8.homeview.direct;

import android.content.Context;
import android.net.nsd.NsdManager;
import android.net.nsd.NsdServiceInfo;
import android.os.Handler;
import android.os.Looper;
import java.io.IOException;
import java.net.HttpURLConnection;
import java.net.InetAddress;
import java.net.Proxy;
import java.net.URL;
import java.util.concurrent.atomic.AtomicBoolean;

/** Bounded DACP adapter. The destination comes only from the active sender's Bonjour ID.
 * No URL/IP/header is accepted from the webpage; Active-Remote never leaves memory/logs.
 * Protocol reference: pinned Android-AirPlay audio/DacpController.kt (GPL-3.0).
 */
final class AirPlayRemote {
    private final NsdManager nsd;
    private final Handler main=new Handler(Looper.getMainLooper());
    private final AtomicBoolean busy=new AtomicBoolean();
    private volatile Endpoint endpoint;
    private volatile int generation;
    private String id="",remote="";
    private static final class Endpoint {
        final InetAddress host;final int port,generation;final String remote;
        Endpoint(InetAddress h,int p,String r,int g){host=h;port=p;remote=r;generation=g;}
    }
    AirPlayRemote(Context context){nsd=(NsdManager)context.getSystemService(Context.NSD_SERVICE);}
    boolean ready(){return endpoint!=null;}
    synchronized void reset(){++generation;endpoint=null;id="";remote="";}
    synchronized void update(String value,String auth){
        if(value==null||auth==null||!value.matches("[A-Fa-f0-9]{1,64}")||!auth.matches("[0-9]{1,32}"))return;
        if(value.equals(id)&&auth.equals(remote))return;
        id=value;remote=auth;endpoint=null;int current=++generation;
        resolve(current,value,auth,0);
    }
    private void resolve(final int current,final String value,final String auth,final int attempt){
        main.post(()->{
            if(current!=generation)return;
            NsdServiceInfo service=new NsdServiceInfo();service.setServiceType("_dacp._tcp.");service.setServiceName("iTunes_Ctrl_"+value);
            try{nsd.resolveService(service,new NsdManager.ResolveListener(){
                public void onResolveFailed(NsdServiceInfo info,int code){retry(current,value,auth,attempt);}
                public void onServiceResolved(NsdServiceInfo info){
                    InetAddress host=info.getHost();int port=info.getPort();
                    if(current!=generation||host==null||port<1||port>65535)return;
                    if(host.isLoopbackAddress()||host.isAnyLocalAddress()||!(host.isSiteLocalAddress()||host.isLinkLocalAddress()))return;
                    if(!info.getServiceName().equalsIgnoreCase("iTunes_Ctrl_"+value))return;
                    endpoint=new Endpoint(host,port,auth,current);
                }
            });}catch(Exception ignored){retry(current,value,auth,attempt);}
        });
    }
    private void retry(int current,String value,String auth,int attempt){
        if(current==generation&&attempt<3)main.postDelayed(()->resolve(current,value,auth,attempt+1),2500);
    }
    void send(String action)throws Exception{
        String command;
        if("play".equals(action))command="play";else if("pause".equals(action))command="pause";
        else if("next".equals(action))command="nextitem";else if("previous".equals(action))command="previtem";
        else throw new IllegalArgumentException("不支持的播放操作");
        Endpoint target=endpoint;if(target==null)throw new IllegalArgumentException("请在 iPhone 或 Mac 上控制播放");
        if(!busy.compareAndSet(false,true))throw new IllegalArgumentException("正在发送播放操作，请稍候");
        HttpURLConnection connection=null;
        try{
            if(target.generation!=generation)throw new IOException();
            URL url=new URL("http",target.host.getHostAddress(),target.port,"/ctrl-int/1/"+command);
            connection=(HttpURLConnection)url.openConnection(Proxy.NO_PROXY);connection.setConnectTimeout(1800);connection.setReadTimeout(1800);connection.setInstanceFollowRedirects(false);connection.setUseCaches(false);
            connection.setRequestProperty("Active-Remote",target.remote);connection.setRequestProperty("Connection","close");
            int code=connection.getResponseCode();
            if(target.generation!=generation||code<200||code>=300)throw new IOException();
        }catch(IOException failure){throw new IllegalArgumentException("发送端暂不支持此操作，请在 iPhone 或 Mac 上控制播放");}
        finally{if(connection!=null)connection.disconnect();busy.set(false);}
    }
}
