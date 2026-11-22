package dev.pro8.homeview.direct;
import org.json.*;
/** Read-only song comments; bounded public fields, never account credentials. */
final class MusicComments {
    static JSONObject page(String id,int offset,JSONObject result)throws Exception{
        if(id==null||!id.matches("[0-9]{1,20}")||offset<0||offset>1000000)throw new IllegalArgumentException("评论请求无效");
        JSONArray raw=result.optJSONArray("comments"),items=comments(raw),hot=offset==0?comments(result.optJSONArray("hotComments")):new JSONArray();
        int count=raw==null?0:Math.min(raw.length(),20),next=offset+count,total=Math.max(0,result.optInt("total"));
        return new JSONObject().put("id",id).put("items",items).put("hot",hot).put("total",total).put("next_offset",next).put("has_more",count>0&&(result.has("more")?result.optBoolean("more"):next<total));
    }
    private static String avatar(String raw){try{if(raw.length()>2048)return "";java.net.URI u=new java.net.URI(raw);String scheme=u.getScheme(),host=u.getHost();if(!("http".equals(scheme)||"https".equals(scheme))||host==null||!host.endsWith(".music.126.net")||u.getRawUserInfo()!=null||u.getPort()!=-1)return "";return raw.startsWith("http:")?"https:"+raw.substring(5):raw;}catch(Exception e){return "";}}
    private static String text(String s,int limit){return s.length()>limit?s.substring(0,limit):s;}
    private static JSONArray comments(JSONArray raw)throws Exception{
        JSONArray out=new JSONArray();if(raw==null)return out;java.util.Set<String> seen=new java.util.HashSet<>();
        for(int i=0;i<Math.min(raw.length(),20);i++){JSONObject r=raw.optJSONObject(i);if(r==null)continue;String id=r.optString("commentId"),content=text(r.optString("content"),3000);if(!id.matches("[0-9]{1,24}")||content.isEmpty()||!seen.add(id))continue;JSONObject user=r.optJSONObject("user");out.put(new JSONObject().put("id",id).put("content",content).put("name",text(user==null?"音乐用户":user.optString("nickname","音乐用户"),80)).put("avatar",avatar(user==null?"":user.optString("avatarUrl"))).put("time",Math.max(0,r.optLong("time"))).put("likes",Math.max(0,r.optLong("likedCount"))));}
        return out;
    }
}
