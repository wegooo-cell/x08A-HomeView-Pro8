package dev.pro8.homeview.direct;

import android.content.Context;
import android.content.pm.ApplicationInfo;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.drawable.Drawable;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import java.io.ByteArrayOutputStream;
import java.util.*;
import org.json.*;

/** Recent HomeView sessions. Thumbnails are bounded and memory-only. No task/root privileges. */
final class LocalRecentApps {
    private final Context context;
    private final LinkedHashMap<String,JSONObject> entries=new LinkedHashMap<>();
    private final Map<String,String> previews=new HashMap<>();
    private String active="";
    private static final Map<String,String> NAMES=new HashMap<>();
    static {String[] names={"home","家庭","calendar","日历","photos","相册","clock","时钟","timer","计时器","weather","天气","settings","设置","apps","应用","system","系统应用","files","文件","faces","待机表盘","background","背景","music","音乐","vinyl","黑胶音乐","today","今天","night","夜间"};for(int i=0;i<names.length;i+=2)NAMES.put(names[i],names[i+1]);}
    LocalRecentApps(Context context){this.context=context.getApplicationContext();}
    @JavascriptInterface public synchronized void active(String path){
        if(path==null||path.isEmpty()){active="";return;}
        if(!path.matches("/frame/hv/[a-z]+/"))return;String name=path.split("/")[3];if(!NAMES.containsKey(name))return;
        String id=(name.equals("music")||name.equals("vinyl"))?"web:music":"web:app:"+name;
        try{JSONObject old=entries.get(id);if(old!=null&&!path.equals(old.optString("url")))previews.remove(id);
            JSONObject item=NetEaseClient.obj("id",id,"title",NAMES.get(name),"kind","web","url",path,"at",System.currentTimeMillis());
            entries.remove(id);entries.put(id,item);active=id;trim();
        }catch(Exception ignored){}
    }
    @JavascriptInterface public synchronized void loaded(String path){
        // Prewarming is not an application visit. Only refresh a session that
        // has actually been opened, without changing the foreground owner.
        if(path==null||!path.matches("/frame/hv/[a-z]+/"))return;
        String name=path.split("/")[3],id=(name.equals("music")||name.equals("vinyl"))?"web:music":"web:app:"+name;
        if(!entries.containsKey(id))return;String previous=active;active(path);active=previous;
    }
    private void trim(){while(entries.size()>10){String key=entries.keySet().iterator().next();entries.remove(key);previews.remove(key);}}
    synchronized void external(String pkg,String route){
        if(((HomeViewApplication)context).installedApps().hidden(pkg)||context.getPackageName().equals(pkg))return;
        if("dev.pro8.vinyl".equals(pkg)){active("/frame/hv/vinyl/");return;}
        try{
            ApplicationInfo app=context.getPackageManager().getApplicationInfo(pkg,0);
            String title=String.valueOf(context.getPackageManager().getApplicationLabel(app)).replace("网易云音乐","音乐").replace("网易云","音乐");
            String id="native:"+pkg;JSONObject item=NetEaseClient.obj("id",id,"title",title,"kind","native","package",pkg,"url",route,"at",System.currentTimeMillis(),"icon",icon(pkg));
            entries.remove(id);entries.put(id,item);trim();active="";
        }catch(Exception ignored){}
    }
    private String icon(String pkg)throws Exception{
        Drawable icon=context.getPackageManager().getApplicationIcon(pkg);Bitmap bitmap=Bitmap.createBitmap(64,64,Bitmap.Config.ARGB_8888);Canvas canvas=new Canvas(bitmap);icon.setBounds(0,0,64,64);icon.draw(canvas);
        ByteArrayOutputStream out=new ByteArrayOutputStream();bitmap.compress(Bitmap.CompressFormat.PNG,100,out);bitmap.recycle();return "data:image/png;base64,"+Base64.encodeToString(out.toByteArray(),Base64.NO_WRAP);
    }
    synchronized void snapshot(Bitmap source){
        if(active.isEmpty()||!entries.containsKey(active))return;
        Bitmap small=Bitmap.createScaledBitmap(source,480,300,true);ByteArrayOutputStream out=new ByteArrayOutputStream();small.compress(Bitmap.CompressFormat.JPEG,78,out);if(small!=source)small.recycle();
        previews.put(active,"data:image/jpeg;base64,"+Base64.encodeToString(out.toByteArray(),Base64.NO_WRAP));
        // Keep only a few compressed snapshots; other routes are reopened on
        // demand rather than allocating a WebView for every recent card.
        if(previews.size()>6)for(String key:entries.keySet())if(!key.equals(active)&&previews.containsKey(key)){previews.remove(key);break;}
    }
    synchronized JSONObject state()throws Exception{
        JSONArray out=new JSONArray();ArrayList<JSONObject> list=new ArrayList<>(entries.values());Collections.reverse(list);
        for(JSONObject entry:list){if(entry.optString("kind").equals("native")&&((HomeViewApplication)context).installedApps().hidden(entry.optString("package")))continue;JSONObject item=new JSONObject(entry.toString());String preview=previews.get(item.optString("id"));if(preview!=null)item.put("preview",preview);out.put(item);}
        return NetEaseClient.obj("ok",true,"items",out,"scope","homeview-sessions","service_notice","关闭卡片不会停止独立应用及其后台服务");
    }
    synchronized JSONObject close(String id)throws Exception{
        JSONObject item=entries.get(id);if(item==null)throw new IllegalArgumentException("应用卡片已关闭");
        // A launcher card is a session entry. Dismissing it never terminates
        // an external app or its media, connection or foreground service.
        if(id.equals("web:music"))context.stopService(new android.content.Intent(context,AirPlayService.class));
        entries.remove(id);previews.remove(id);if(active.equals(id))active="";
        return NetEaseClient.obj("ok",true,"id",id,"background_services_may_continue",item.optString("kind").equals("native"));
    }
}
