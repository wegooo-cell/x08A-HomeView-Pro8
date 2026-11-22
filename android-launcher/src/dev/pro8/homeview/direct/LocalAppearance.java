package dev.pro8.homeview.direct;

import android.content.Context;
import android.util.AtomicFile;
import android.util.Base64;
import org.json.*;
import java.io.*;

/** Independent desktop/app wallpaper settings, stored only on the device. */
final class LocalAppearance {
    static final String[] SCOPES={"home","calendar","photos","apps","clock","timer","weather","settings","faces","lockscreen","lounge","files","system"};
    private final AtomicFile file;private final LocalAlbum album;private boolean independent=false;private String backgroundDefault="#e6e7eb";
    LocalAppearance(Context c,LocalAlbum a){file=new AtomicFile(new File(c.getFilesDir(),"appearance.json"));album=a;}
    LocalAppearance(Context c,LocalAlbum a,LocalAppearance initial)throws Exception{
        file=new AtomicFile(new File(c.getFilesDir(),"desktop-appearance.json"));album=a;
        // Snapshot once on upgrade. Later app changes must never alter the desktop.
        if(!file.getBaseFile().exists()&&!new File(file.getBaseFile()+".bak").exists())change(initial.state().getJSONObject("wallpaper"));
    }
    LocalAppearance(Context c,LocalAlbum a,String scope){
        boolean allowed=false;for(String key:SCOPES)if(key.equals(scope))allowed=true;
        if(!allowed)throw new IllegalArgumentException("请选择应用");
        file=new AtomicFile(new File(c.getFilesDir(),"app-appearance-"+scope+".json"));album=a;independent=true;if(scope.equals("lounge"))backgroundDefault="#000000";
    }
    JSONObject state()throws Exception{synchronized(album){
        JSONObject data=independent?NetEaseClient.obj("t","color","c",backgroundDefault):NetEaseClient.obj("t","builtin","id","blue");
        try(InputStream in=file.openRead()){data=validate(new JSONObject(new String(NetEaseClient.read(in,1300000),"UTF-8")));}catch(Exception ignored){}
        if(data.optString("t").equals("album"))data.put("revision",album.revision(data.optString("id")));
        return NetEaseClient.obj("ok",true,"wallpaper",data);
    }}
    JSONObject change(JSONObject b)throws Exception{synchronized(album){
        JSONObject data=validate(b);FileOutputStream out=null;try{out=file.startWrite();out.write(data.toString().getBytes("UTF-8"));file.finishWrite(out);}catch(Exception e){if(out!=null)file.failWrite(out);throw e;}
        return NetEaseClient.obj("ok",true);
    }}
    private JSONObject validate(JSONObject b)throws Exception{
        String kind=b.optString("t"),id=b.optString("id"),name=b.optString("name","相册壁纸");if(name.length()>60)name=name.substring(0,60);
        if(kind.equals("builtin")&&(id.equals("blue")||id.equals("violet")))return NetEaseClient.obj("t",kind,"id",id);
        if(kind.equals("auto")&&!independent)return NetEaseClient.obj("t",kind);
        if(kind.equals("color")&&b.optString("c").matches("#[0-9a-fA-F]{6}"))return NetEaseClient.obj("t",kind,"c",b.getString("c"));
        if(kind.equals("album")&&id.matches("import-[0-9a-f]{16}")&&album.contains(id))return NetEaseClient.obj("t",kind,"id",id,"name",name);
        if(kind.equals("custom")){JSONObject out=NetEaseClient.obj("t",kind,"name",name);for(String key:new String[]{"image","soft"}){String value=b.optString(key);if(value.length()>(key.equals("image")?1100000:160000)||!value.matches("data:image/jpeg;base64,[A-Za-z0-9+/=]+"))throw new IllegalArgumentException("壁纸图片无效");byte[] bytes=Base64.decode(value.substring(23),Base64.DEFAULT);if(bytes.length<3||(bytes[0]&255)!=255||(bytes[1]&255)!=216)throw new IllegalArgumentException("壁纸图片无效");out.put(key,value);}return out;}
        throw new IllegalArgumentException("请选择有效的背景");
    }
}
