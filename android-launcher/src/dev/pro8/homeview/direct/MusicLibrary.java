package dev.pro8.homeview.direct;

import java.util.HashMap;
import java.util.Map;
import org.json.JSONArray;
import org.json.JSONObject;

/** Bounded pages over an immutable playlist ID snapshot; no network or account storage. */
final class MusicLibrary {
    static String id(String value) {
        if(value==null||!value.matches("[0-9]{1,20}"))throw new IllegalArgumentException("无效的音乐 ID");
        return value;
    }
    static int number(String value,int fallback,int maximum) {
        if(value==null)return fallback;
        if(!value.matches("[0-9]{1,8}"))throw new IllegalArgumentException("无效的分页位置");
        int n=Integer.parseInt(value);if(n>maximum)throw new IllegalArgumentException("分页位置过大");return n;
    }
    static JSONArray ids(JSONObject playlist)throws Exception {
        JSONArray source=playlist.optJSONArray("trackIds");if(source==null)source=playlist.optJSONArray("tracks");
        JSONArray out=new JSONArray();if(source==null)return out;
        for(int i=0;i<source.length();i++){JSONObject item=source.optJSONObject(i);if(item!=null)out.put(id(item.optString("id")));}
        return out;
    }
    static JSONArray slice(JSONArray ids,int offset,int limit)throws Exception {
        if(offset<0||offset>ids.length()||limit<1||limit>50)throw new IllegalArgumentException("无效的分页位置");
        JSONArray out=new JSONArray();for(int i=offset;i<Math.min(ids.length(),offset+limit);i++)out.put(ids.getString(i));return out;
    }
    static String revision(JSONArray ids)throws Exception {
        byte[] hash=java.security.MessageDigest.getInstance("SHA-256").digest(ids.toString().getBytes("UTF-8"));
        StringBuilder out=new StringBuilder();for(byte b:hash)out.append(String.format("%02x",b&255));return out.toString();
    }
    static JSONArray ordered(JSONArray ids,JSONArray details)throws Exception {
        Map<String,JSONObject> map=new HashMap<>();for(int i=0;i<details.length();i++){JSONObject song=details.optJSONObject(i);if(song!=null)map.put(song.optString("id"),song);}
        JSONArray out=new JSONArray();for(int i=0;i<ids.length();i++){String id=ids.getString(i);JSONObject song=map.get(id);
            if(song==null)song=new JSONObject().put("id",id).put("name","暂不可用歌曲").put("unavailable",true);
            out.put(song);
        }return out;
    }
    static JSONObject like(JSONObject body)throws Exception {
        String id=id(body.optString("id"));if(!(body.opt("like") instanceof Boolean))throw new IllegalArgumentException("请选择喜欢或取消喜欢");
        return new JSONObject().put("alg","itembased").put("trackId",id).put("like",body.getBoolean("like")).put("time","3");
    }
}
