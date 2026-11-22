package dev.pro8.homeview.direct;

import android.content.Context;
import android.net.Uri;
import org.json.*;
import java.io.*;
import java.util.regex.*;

/** Public originals in Pictures/HomeView; private manifest and optimized image derivatives. */
final class LocalAlbum {
    private final File folder;private final AlbumFolder storage;
    LocalAlbum(Context c){this(c,new File(c.getFilesDir(),"homeview-album"),null);}
    LocalAlbum(Context c,File privateFolder,File publicFolder){folder=privateFolder;storage=publicFolder==null?new AlbumFolder(c,this):new AlbumFolder(c,this,publicFolder);storage.refresh();}
    File folder(){return folder;}
    synchronized JSONArray manifest()throws Exception{File f=new File(folder,"manifest.json");if(!f.isFile())return new JSONArray();try(InputStream in=new android.util.AtomicFile(f).openRead()){return new JSONArray(new String(NetEaseClient.read(in,1024*1024),"UTF-8"));}}
    synchronized void saveManifest(JSONArray data)throws Exception{folder.mkdirs();android.util.AtomicFile f=new android.util.AtomicFile(new File(folder,"manifest.json"));FileOutputStream out=null;try{out=f.startWrite();out.write(data.toString().getBytes("UTF-8"));f.finishWrite(out);}catch(Exception e){if(out!=null)f.failWrite(out);throw e;}}
    void close(){storage.close();}
    synchronized JSONArray items()throws Exception{
        File manifest=new File(folder,"manifest.json");JSONArray out=new JSONArray();if(!manifest.isFile())return out;
        JSONArray source;try(InputStream in=new FileInputStream(manifest)){source=new JSONArray(new String(NetEaseClient.read(in,1024*1024),"UTF-8"));}
        for(int i=0;i<Math.min(2000,source.length());i++){JSONObject x=source.optJSONObject(i);if(x==null)continue;String id=x.optString("id");if(!id.matches("import-[0-9a-f]{16}")||!new File(folder,id+"-1280.jpg").isFile())continue;
            out.put(NetEaseClient.obj("id",id,"kind","photo","url","/api/frame/photo/"+id+".jpg"+(x.optLong("source_mtime")>0?"?rev="+x.optLong("source_mtime"):""),"w",x.optInt("w"),"h",x.optInt("h"),"t",Double.isFinite(x.optDouble("t",0))?x.optDouble("t",0):0));
        }return out;
    }
    synchronized long revision(String id)throws Exception{JSONArray all=manifest();for(int i=0;i<all.length();i++){JSONObject p=all.optJSONObject(i);if(p!=null&&id.equals(p.optString("id")))return p.optLong("source_mtime");}return 0;}
    boolean contains(String id)throws Exception{JSONArray all=items();for(int i=0;i<all.length();i++)if(id.equals(all.getJSONObject(i).optString("id")))return true;return false;}
    JSONObject listing()throws Exception{JSONArray all=items();JSONObject out=storage.state();return out.put("ok",true).put("photos",all).put("imported_count",all.length()).put("sample",false);}
    synchronized JSONObject remove(JSONObject request,java.util.Set<String> inUse)throws Exception{
        if(!Boolean.TRUE.equals(request.opt("confirmed")))throw new IllegalArgumentException("请先确认删除照片");
        android.util.AtomicFile manifest=new android.util.AtomicFile(new File(folder,"manifest.json"));JSONArray original;
        try(InputStream in=manifest.openRead()){original=new JSONArray(new String(NetEaseClient.read(in,1024*1024),"UTF-8"));}
        AlbumRemoval.Plan plan=AlbumRemoval.plan(folder,original,request.optJSONArray("ids"),inUse);
        boolean hasSource=false;for(int i=0;i<original.length();i++){JSONObject p=original.optJSONObject(i);if(p!=null&&!p.optString("source").isEmpty())for(int j=0;j<plan.removed.length();j++)if(p.optString("id").equals(plan.removed.optString(j)))hasSource=true;}if(hasSource&&!storage.allowed())throw new IllegalArgumentException("请先允许存储权限，再删除文件夹中的照片");
        AlbumSourceDeletion originals=new AlbumSourceDeletion(storage.directory,folder);originals.stage(original,plan.removed);
        FileOutputStream out=null;try{out=manifest.startWrite();out.write(plan.remaining.toString().getBytes("UTF-8"));manifest.finishWrite(out);}catch(Exception e){if(out!=null)manifest.failWrite(out);originals.recover(original);throw e;}
        int pending=plan.clean()+originals.finish();return NetEaseClient.obj("ok",true,"removed",plan.removed,"remaining",plan.remaining.length(),"cleanup_pending",pending);
    }
    byte[] image(Uri uri)throws Exception{
        Matcher m=Pattern.compile("/api/frame/photo/(import-[0-9a-f]{16})\\.(jpg|wall\\.webp|soft\\.webp)").matcher(uri.getPath());
        if(!m.matches()||!contains(m.group(1)))throw new FileNotFoundException();
        String kind=m.group(2),suffix;
        if(kind.equals("jpg")){int w=1280;try{w=Integer.parseInt(uri.getQueryParameter("w"));}catch(Exception ignored){}suffix="-"+(w<=160?160:w<=640?640:1280)+".jpg";}
        else suffix=kind.equals("wall.webp")?"-wall.webp":"-soft.webp";
        File f=new File(folder,m.group(1)+suffix);try(InputStream in=new FileInputStream(f)){return NetEaseClient.read(in,2*1024*1024);}
    }
}
