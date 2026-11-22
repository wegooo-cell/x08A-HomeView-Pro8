package dev.pro8.homeview.direct;

import android.content.*;
import android.content.pm.ServiceInfo;
import android.os.*;
import com.xiaomi.miot.DeviceInfo;
import org.json.*;
import java.io.IOException;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;
import java.util.regex.*;

/** Fixed, version-checked local IPC. Account credentials remain with the built-in Xiaomi app. */
final class LocalMijia {
    private static final String INTERFACE="com.xiaomi.miot.service.IMiuiService",CALLBACK="com.xiaomi.miot.service.ICallback";
    private static final ComponentName COMPONENT=new ComponentName("com.xiaomi.smarthome","com.xiaomi.smarthome.service.MiuiService");
    private final Context context;
    private final Handler main=new Handler(Looper.getMainLooper());
    private volatile IBinder remote;
    private volatile boolean bound,closed;
    private volatile CountDownLatch ready=new CountDownLatch(1);
    private long loadedAt;
    private JSONArray items=new JSONArray();
    private final Map<String,DeviceInfo> controls=new HashMap<>();
    LocalMijia(Context c){context=c.getApplicationContext();}
    boolean available(){try{ServiceInfo s=context.getPackageManager().getServiceInfo(COMPONENT,0);return s.enabled&&s.exported;}catch(Exception e){return false;}}
    private final ServiceConnection connection=new ServiceConnection(){
        public void onServiceConnected(ComponentName n,IBinder b){remote=b;ready.countDown();}
        public void onServiceDisconnected(ComponentName n){remote=null;ready=new CountDownLatch(1);}
        public void onBindingDied(ComponentName n){remote=null;main.post(()->{if(bound){try{context.unbindService(this);}catch(Exception ignored){}bound=false;}ready.countDown();});}
    };
    private IBinder connect()throws Exception{
        if(closed||!available())throw new IOException("此设备的内置米家暂时不可用");
        if(remote==null&&!bound){ready=new CountDownLatch(1);main.post(()->{if(closed||bound)return;try{bound=context.bindService(new Intent().setComponent(COMPONENT),connection,Context.BIND_AUTO_CREATE);}catch(Exception ignored){}if(!bound)ready.countDown();});}
        if(remote==null&&!ready.await(2500,TimeUnit.MILLISECONDS))throw new IOException("米家连接超时，请稍后刷新");
        IBinder b=remote;if(b==null||!INTERFACE.equals(b.getInterfaceDescriptor()))throw new IOException("米家连接暂时不可用");
        Parcel in=Parcel.obtain(),out=Parcel.obtain();try{in.writeInterfaceToken(INTERFACE);if(!b.transact(11,in,out,0))throw new IOException("此版本米家暂不支持连接");out.readException();if(out.readInt()!=2)throw new IOException("此版本米家暂不支持连接");}finally{in.recycle();out.recycle();}return b;
    }
    private abstract static class Reply extends Binder {
        Reply(){attachInterface(null,CALLBACK);}
        protected boolean onTransact(int code,Parcel in,Parcel out,int flags)throws RemoteException{
            if(code==INTERFACE_TRANSACTION){if(out!=null)out.writeString(CALLBACK);return true;}
            if(code!=1&&code!=2)return super.onTransact(code,in,out,flags);
            in.enforceInterface(CALLBACK);
            try{Bundle b=in.readInt()!=0?Bundle.CREATOR.createFromParcel(in):new Bundle();b.setClassLoader(DeviceInfo.class.getClassLoader());receive(code==1,b);}catch(RuntimeException e){failed();}
            if(out!=null)out.writeNoException();return true;
        }
        abstract void receive(boolean ok,Bundle b);
        abstract void failed();
    }
    synchronized JSONArray entities()throws Exception{
        if(SystemClock.elapsedRealtime()-loadedAt<2000&&loadedAt>0)return items;
        IBinder b=connect();CountDownLatch done=new CountDownLatch(1);AtomicReference<ArrayList<DeviceInfo>> devices=new AtomicReference<>();AtomicBoolean error=new AtomicBoolean();
        Reply reply=new Reply(){void receive(boolean ok,Bundle data){if(!ok){error.set(true);done.countDown();return;}ArrayList<DeviceInfo> list=data.getParcelableArrayList("device_infos");if(list!=null&&devices.compareAndSet(null,list))done.countDown();}void failed(){error.set(true);done.countDown();}};
        Parcel in=Parcel.obtain(),out=Parcel.obtain();try{in.writeInterfaceToken(INTERFACE);in.writeStrongBinder(reply);if(!b.transact(2,in,out,0))throw new IOException("米家暂不支持设备读取");out.readException();}finally{in.recycle();out.recycle();}
        if(!done.await(5,TimeUnit.SECONDS)||error.get()||devices.get()==null)throw new IOException("暂未读取到米家设备，请确认已在原生米家登录后刷新");
        JSONArray next=new JSONArray();Map<String,DeviceInfo> nextControls=new HashMap<>();
        for(DeviceInfo d:devices.get()){
            if(next.length()>=512)break;
            if(d.did==null||d.did.isEmpty())continue;
            String model=d.model==null?"":d.model,kind=!d.canSwitch?"device":model.contains(".light.")?"light":model.contains(".acpartner.")||model.contains(".aircondition.")?"climate":"switch";
            String stem=key(d.did),id=kind+".mi_"+stem;
            JSONObject attrs=NetEaseClient.obj("friendly_name",d.name==null?"米家设备":d.name,"read_only",!d.canSwitch,"native_details",true,"provider","mijia");
            if(kind.equals("light"))attrs.put("supported_color_modes",new JSONArray().put("onoff"));
            if(kind.equals("climate"))attrs.put("hvac_modes",new JSONArray().put("off").put("on"));
            next.put(NetEaseClient.obj("entity_id",id,"state",!d.online?"unavailable":d.canSwitch?(d.on?"on":"off"):"online","attributes",attrs));
            if(d.canSwitch)nextControls.put(id,d);
            if(d.subtitles!=null)for(String label:d.subtitles.keySet()){
                String sensor=label.equals("温度")||label.equalsIgnoreCase("temperature")?"temperature":label.equals("湿度")||label.equalsIgnoreCase("humidity")?"humidity":"";
                if(sensor.isEmpty())continue;
                JSONObject reading=MijiaReading.parse(sensor,String.valueOf(d.subtitles.get(label)));
                if(reading==null)continue;
                next.put(NetEaseClient.obj("entity_id","sensor.mi_"+stem+"_"+sensor,"state",d.online?reading.getString("value"):"unavailable","attributes",NetEaseClient.obj("friendly_name",(d.name==null?"米家设备":d.name)+" · "+(sensor.equals("temperature")?"温度":"湿度"),"device_class",sensor,"unit_of_measurement",reading.getString("unit"),"provider","mijia")));
            }
        }
        items=next;controls.clear();controls.putAll(nextControls);loadedAt=SystemClock.elapsedRealtime();return items;
    }
    static String key(String did)throws Exception{byte[] bytes=MessageDigest.getInstance("SHA-256").digest(did.getBytes("UTF-8"));StringBuilder s=new StringBuilder();for(int i=0;i<12;i++)s.append(String.format(Locale.ROOT,"%02x",bytes[i]&255));return s.toString();}
    synchronized JSONObject pins()throws Exception{
        android.content.SharedPreferences p=context.getSharedPreferences("homeview_mijia",0);if(p.contains("pins"))return new JSONObject(p.getString("pins","{}"));
        JSONObject chosen=new JSONObject();for(int i=0;i<items.length();i++){JSONObject e=items.getJSONObject(i);String id=e.getString("entity_id"),kind=id.split("\\.")[0];if((kind.equals("light")||kind.equals("climate"))&&!chosen.has(kind))chosen.put(kind,id);JSONObject a=e.getJSONObject("attributes");String sensor=a.optString("device_class");if((sensor.equals("temperature")||sensor.equals("humidity"))&&!chosen.has(sensor))chosen.put(sensor,id);}
        if(items.length()>0)p.edit().putString("pins",chosen.toString()).apply();return chosen;
    }
    synchronized JSONObject savePins(JSONObject data)throws Exception{
        JSONArray list=entities();JSONObject selected=new JSONObject();for(String slot:new String[]{"light","climate","temperature","humidity","home_scene","night_scene"}){
            String id=data.optString(slot);if(id.isEmpty())continue;JSONObject e=null;for(int i=0;i<list.length();i++)if(id.equals(list.getJSONObject(i).getString("entity_id")))e=list.getJSONObject(i);
            String kind=id.split("\\.")[0];boolean valid=e!=null&&(slot.equals("light")?(kind.equals("light")||kind.equals("switch")):slot.equals("climate")?kind.equals("climate"):slot.equals("temperature")||slot.equals("humidity")?kind.equals("sensor")&&slot.equals(e.getJSONObject("attributes").optString("device_class")):false);
            if(!valid)throw new IllegalArgumentException("请选择对应的米家设备");selected.put(slot,id);
        }
        if(!context.getSharedPreferences("homeview_mijia",0).edit().putString("pins",selected.toString()).commit())throw new IOException("组件保存失败，请重试");return NetEaseClient.obj("ok",true,"pins",selected);
    }
    synchronized JSONObject control(JSONObject data)throws Exception{
        entities();DeviceInfo d=controls.get(data.optString("entity_id"));
        if(d==null||!d.online||!d.canSwitch)throw new IllegalArgumentException("设备离线或不支持开关控制");
        if(!data.optString("action").equals("toggle"))throw new IllegalArgumentException("请在内置米家中进行这项调节");
        IBinder b=connect();CountDownLatch done=new CountDownLatch(1);AtomicBoolean ok=new AtomicBoolean();Reply reply=new Reply(){void receive(boolean success,Bundle ignored){ok.set(success);done.countDown();}void failed(){done.countDown();}};
        Parcel in=Parcel.obtain(),out=Parcel.obtain();try{in.writeInterfaceToken(INTERFACE);in.writeString(d.did);in.writeInt(d.on?0:1);in.writeStrongBinder(reply);if(!b.transact(4,in,out,0))throw new IOException("米家暂不支持这项控制");out.readException();}finally{in.recycle();out.recycle();}
        if(!done.await(5,TimeUnit.SECONDS)||!ok.get())throw new IOException("米家未确认操作，请刷新设备状态");loadedAt=0;return NetEaseClient.obj("ok",true);
    }
    void close(){closed=true;remote=null;main.post(()->{if(bound){try{context.unbindService(connection);}catch(Exception ignored){}bound=false;}ready.countDown();});}
}
