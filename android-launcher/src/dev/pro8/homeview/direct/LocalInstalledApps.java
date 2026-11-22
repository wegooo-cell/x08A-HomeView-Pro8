package dev.pro8.homeview.direct;

import android.content.*;
import android.content.pm.*;
import android.graphics.*;
import android.graphics.drawable.Drawable;
import android.net.Uri;
import android.provider.Settings;
import android.util.LruCache;
import org.json.*;
import java.io.ByteArrayOutputStream;
import java.text.Collator;
import java.util.*;

/** Installed packages for this Android user. Never changes a package's enabled state. */
final class LocalInstalledApps {
    private final Context context;
    private final PackageManager pm;
    private JSONArray cached;
    private final Set<String> hiddenPackages=new HashSet<>();
    boolean hidden(String pkg){return hiddenPackages.contains(pkg);}
    private final java.util.concurrent.CopyOnWriteArrayList<Runnable> listeners=new java.util.concurrent.CopyOnWriteArrayList<>();
    void watch(Runnable listener){listeners.addIfAbsent(listener);}
    void unwatch(Runnable listener){listeners.remove(listener);}
    private long revision=1;
    private final LruCache<String,byte[]> icons=new LruCache<String,byte[]>(512*1024){
        @Override protected int sizeOf(String key,byte[] value){return value.length;}
    };
    LocalInstalledApps(Context c){
        context=c.getApplicationContext();pm=context.getPackageManager();
        try(java.io.InputStream input=context.getAssets().open("launcher-policy.json")){JSONArray values=new JSONObject(new String(NetEaseClient.read(input,8192),"UTF-8")).optJSONArray("hidden_packages");if(values!=null)for(int i=0;i<values.length();i++){String value=values.optString(i);if(validPackage(value))hiddenPackages.add(value);}}catch(Exception ignored){}
        IntentFilter filter=new IntentFilter();filter.addDataScheme("package");
        for(String action:new String[]{Intent.ACTION_PACKAGE_ADDED,Intent.ACTION_PACKAGE_REMOVED,Intent.ACTION_PACKAGE_CHANGED,Intent.ACTION_PACKAGE_REPLACED})filter.addAction(action);
        context.registerReceiver(new BroadcastReceiver(){@Override public void onReceive(Context c,Intent i){invalidate();}},filter);
    }
    synchronized void invalidate(){cached=null;revision++;icons.evictAll();for(Runnable listener:listeners)listener.run();}
    static boolean validPackage(String pkg){return pkg!=null&&pkg.length()<=255&&pkg.matches("[A-Za-z0-9_]+(?:\\.[A-Za-z0-9_]+)*");}
    private String label(ApplicationInfo info){try{return String.valueOf(pm.getApplicationLabel(info)).replace("网易云音乐","音乐").replace("网易云","音乐");}catch(RuntimeException e){return info.packageName;}}
    private ApplicationInfo installed(String pkg)throws Exception{
        if(!validPackage(pkg))throw new IllegalArgumentException("应用标识无效");
        ApplicationInfo info=pm.getApplicationInfo(pkg,PackageManager.MATCH_DISABLED_COMPONENTS);
        if((info.flags&ApplicationInfo.FLAG_INSTALLED)==0)throw new IllegalArgumentException("应用已卸载");
        return info;
    }
    Intent launch(String pkg)throws Exception{
        if(!installed(pkg).enabled)return null;
        Intent target=pm.getLaunchIntentForPackage(pkg);
        if(target==null)target=pm.getLeanbackLaunchIntentForPackage(pkg);
        if(target==null)return null;
        ResolveInfo resolved=pm.resolveActivity(target,0);
        if(resolved==null||resolved.activityInfo==null||!resolved.activityInfo.enabled||!resolved.activityInfo.exported)return null;
        return target;
    }
    Intent details(String pkg)throws Exception{
        installed(pkg);return new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,Uri.fromParts("package",pkg,null));
    }
    synchronized JSONObject state()throws Exception{
        if(cached==null){
            ArrayList<ApplicationInfo> list=new ArrayList<>(pm.getInstalledApplications(PackageManager.MATCH_DISABLED_COMPONENTS));
            final Collator collator=Collator.getInstance(Locale.SIMPLIFIED_CHINESE);
            Collections.sort(list,(a,b)->collator.compare(label(a),label(b)));
            JSONArray result=new JSONArray();
            for(ApplicationInfo info:list){
                if((info.flags&ApplicationInfo.FLAG_INSTALLED)==0||hidden(info.packageName))continue;
                try{
                    boolean canLaunch=false;try{canLaunch=launch(info.packageName)!=null;}catch(Exception ignored){}
                    result.put(NetEaseClient.obj("package",info.packageName,"name",label(info),"enabled",info.enabled,"launchable",canLaunch,"system",(info.flags&ApplicationInfo.FLAG_SYSTEM)!=0,"icon","/api/hv/installed-apps/icon?package="+Uri.encode(info.packageName)+"&v="+revision));
                }catch(Exception ignored){}
            }
            cached=result;
        }
        return NetEaseClient.obj("ok",true,"revision",revision,"items",cached);
    }
    synchronized byte[] icon(String pkg)throws Exception{
        ApplicationInfo info=installed(pkg);byte[] found=icons.get(pkg);if(found!=null)return found;
        Drawable drawable=pm.getApplicationIcon(info);
        Bitmap bitmap=Bitmap.createBitmap(64,64,Bitmap.Config.ARGB_8888);
        try{drawable.setBounds(0,0,64,64);drawable.draw(new Canvas(bitmap));ByteArrayOutputStream out=new ByteArrayOutputStream();bitmap.compress(Bitmap.CompressFormat.PNG,100,out);found=out.toByteArray();icons.put(pkg,found);return found;}
        finally{bitmap.recycle();}
    }
}
