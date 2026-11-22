package dev.pro8.homeview.direct;
import org.json.*;
import java.io.*;
import java.util.*;

/** Validate the whole selection before committing the manifest or removing fixed derivative files. */
final class AlbumRemoval {
    static final String[] SUFFIXES={"-1280.jpg","-640.jpg","-160.jpg","-wall.webp","-soft.webp"};
    static final class Plan {
        final JSONArray remaining,removed;final List<File> targets;
        Plan(JSONArray remaining,JSONArray removed,List<File> targets){this.remaining=remaining;this.removed=removed;this.targets=targets;}
        int clean(){int pending=0;for(File f:targets)if(f.exists()&&!f.delete())pending++;return pending;}
    }
    static Plan plan(File folder,JSONArray manifest,JSONArray ids,Set<String> inUse)throws Exception{
        if(ids==null||ids.length()==0||ids.length()>200)throw new IllegalArgumentException("请选择要删除的照片");
        Set<String> selected=new LinkedHashSet<>(),known=new HashSet<>();List<File> files=new ArrayList<>();
        for(int i=0;i<manifest.length();i++){JSONObject p=manifest.optJSONObject(i);if(p!=null)known.add(p.optString("id"));}
        for(int i=0;i<ids.length();i++){
            Object raw=ids.get(i);if(!(raw instanceof String))throw new IllegalArgumentException("照片选择无效");String id=(String)raw;
            if(!id.matches("import-[0-9a-f]{16}")||!selected.add(id)||!known.contains(id)||!new File(folder,id+"-1280.jpg").isFile())throw new IllegalArgumentException("照片已不存在，请刷新相册");
            if(inUse.contains(id))throw new IllegalArgumentException("照片正在用作壁纸，请先更换壁纸后再删除");
            for(String suffix:SUFFIXES){File f=new File(folder,id+suffix);if(!f.getCanonicalFile().equals(new File(folder.getCanonicalFile(),id+suffix)))throw new IllegalArgumentException("照片路径无效");if(f.exists()&&!f.isFile())throw new IllegalArgumentException("照片文件无效");files.add(f);}
        }
        JSONArray remaining=new JSONArray(),removed=new JSONArray();for(int i=0;i<manifest.length();i++){JSONObject p=manifest.optJSONObject(i);if(p==null||!selected.contains(p.optString("id")))remaining.put(manifest.get(i));}
        for(String id:selected)removed.put(id);return new Plan(remaining,removed,files);
    }
}
