package dev.pro8.homeview.direct;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.util.AtomicFile;
import android.util.Base64;
import com.google.zxing.BarcodeFormat;
import com.google.zxing.EncodeHintType;
import com.google.zxing.qrcode.QRCodeWriter;
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel;
import com.google.zxing.common.BitMatrix;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.*;
import java.net.*;
import java.security.MessageDigest;
import java.util.*;

/** Direct NetEase adapter. Credentials stay in the application's private storage. */
final class NetEaseClient {
    private final File accountFile, artDir;
    private final android.content.SharedPreferences clientPreferences;
    private final Map<String, QrSession> sessions = new HashMap<>();
    private static class PlaylistPage { String id,name,art,revision;JSONArray ids;boolean liked; }
    private final Map<String,PlaylistPage> libraryPages=new LinkedHashMap<String,PlaylistPage>(4,.75f,true){protected boolean removeEldestEntry(Map.Entry<String,PlaylistPage> e){return size()>3;}};
    private static final String UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0 Safari/537.36";
    private static class QrSession { String key, cookies; long created = System.currentTimeMillis(); }
    NetEaseClient(Context context) { clientPreferences=context.getSharedPreferences("homeview_music_client",0);accountFile = new File(context.getFilesDir(), "netease-account.json"); artDir = new File(context.getCacheDir(), "art"); artDir.mkdirs(); }
    static JSONObject obj(Object... fields) throws Exception { JSONObject o = new JSONObject(); for (int i=0;i<fields.length;i+=2) o.put((String)fields[i], fields[i+1]); return o; }
    static JSONObject object(JSONObject o, String k) { JSONObject a=o.optJSONObject(k); return a==null?new JSONObject():a; }
    static JSONArray array(JSONObject o, String k) { JSONArray a=o.optJSONArray(k); return a==null?new JSONArray():a; }
    static byte[] read(InputStream in, int limit) throws IOException { ByteArrayOutputStream out=new ByteArrayOutputStream(); byte[] b=new byte[8192]; int n,total=0; while((n=in.read(b))!=-1){total+=n;if(total>limit)throw new IOException("响应过大");out.write(b,0,n);}return out.toByteArray(); }
    private synchronized String cookie() { try (InputStream in=new FileInputStream(accountFile)) { return new JSONObject(new String(read(in,32768),"UTF-8")).optString("cookie"); } catch(Exception e){return "";} }
    private synchronized void saveCookie(String cookie) throws Exception { if(!cookie.contains("MUSIC_U="))throw new IOException("未收到登录凭据，请重新扫码"); AtomicFile f=new AtomicFile(accountFile);FileOutputStream out=f.startWrite();try{out.write(obj("cookie",cookie).toString().getBytes("UTF-8"));f.finishWrite(out);synchronized(libraryPages){libraryPages.clear();}}catch(Exception e){f.failWrite(out);throw e;} }
    private static String encode(String s) throws Exception { return URLEncoder.encode(s,"UTF-8"); }
    private static String id(String s) { if(s==null||!s.matches("[0-9]{1,20}"))throw new IllegalArgumentException("无效的音乐 ID");return s; }
    private JSONObject request(String path) throws Exception { JSONObject o=exchange(path,null,cookie(),null);if(o.optInt("code")!=200)throw new MusicServiceException(o.optInt("code"));return o; }
    private JSONObject exchange(String path,String form,String cookie,List<String> setCookies) throws Exception {
        return exchange(path,form,cookie,setCookies,false);
    }
    private JSONObject exchange(String path,String form,String cookie,List<String> setCookies,boolean desktop) throws Exception {
        HttpURLConnection c=(HttpURLConnection)new URL((desktop?"https://interfacepc.music.163.com":"https://music.163.com")+path).openConnection();c.setConnectTimeout(10000);c.setReadTimeout(15000);c.setInstanceFollowRedirects(false);c.setUseCaches(false);c.setRequestProperty("Cache-Control","no-cache");c.setRequestProperty("User-Agent",desktop?"Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Safari/537.36 Chrome/91.0.4472.164 NeteaseMusicDesktop/3.1.29.205117":UA);c.setRequestProperty("Referer","https://music.163.com/");if(!cookie.isEmpty())c.setRequestProperty("Cookie",cookie);
        try{if(form!=null){c.setRequestMethod("POST");c.setDoOutput(true);c.setRequestProperty("Content-Type","application/x-www-form-urlencoded");byte[] body=form.getBytes("UTF-8");c.setFixedLengthStreamingMode(body.length);try(OutputStream out=c.getOutputStream()){out.write(body);}}
            if(c.getResponseCode()!=200)throw new IOException("音乐暂时无法连接");
            if(setCookies!=null)for(Map.Entry<String,List<String>> h:c.getHeaderFields().entrySet())if("Set-Cookie".equalsIgnoreCase(h.getKey()))setCookies.addAll(h.getValue());
            try(InputStream in=c.getInputStream()){return new JSONObject(new String(read(in,8*1024*1024),"UTF-8"));}
        }finally{c.disconnect();}
    }
    private JSONObject weapi(String path,JSONObject payload)throws Exception {
        String cookies=cookie(),csrf="";
        for(String pair:cookies.split(";")){String part=pair.trim();if(part.startsWith("__csrf="))csrf=part.substring(7);}
        JSONObject out=exchange(path.replaceFirst("^/api/","/weapi/")+"?csrf_token="+encode(csrf),NetEaseProtocol.form(payload,csrf),cookies,null);
        return checked(out);
    }
    private JSONObject checked(JSONObject out)throws MusicServiceException {
        int code=out.optInt("code");if(code!=200){android.util.Log.w("HomeViewMusic","request response="+code);throw new MusicServiceException(code);}return out;
    }
    private synchronized String clientDevice()throws IOException {
        String saved=clientPreferences.getString("device_id","");if(!saved.isEmpty())return saved;
        saved=UUID.randomUUID().toString();if(!clientPreferences.edit().putString("device_id",saved).putString("build_version",Long.toString(System.currentTimeMillis()/1000)).commit())throw new IOException("Cannot save music client identity");return saved;
    }
    private JSONObject clientRequest(String path,JSONObject payload)throws Exception {
        String cookies=cookie();Map<String,String> values=new LinkedHashMap<>();
        for(String pair:cookies.split(";")){int eq=pair.indexOf('=');if(eq>0)values.put(pair.substring(0,eq).trim(),pair.substring(eq+1).trim());}
        if(!values.containsKey("MUSIC_U"))throw new MusicServiceException(301);
        JSONObject header=obj("os","pc","appver","3.1.29.205117","osver","Microsoft-Windows-10-Professional-build-19045-64bit","deviceId",clientDevice(),"channel","netease","__csrf",values.containsKey("__csrf")?values.get("__csrf"):"","buildver",clientPreferences.getString("build_version",""),"resolution","1280x800","requestId",System.currentTimeMillis()+"_"+UUID.randomUUID().toString().substring(0,6),"MUSIC_U",values.get("MUSIC_U"));
        String token=clientPreferences.getString("nmtid",values.containsKey("NMTID")?values.get("NMTID"):"");if(!token.isEmpty())header.put("NMTID",token);
        StringBuilder sent=new StringBuilder();for(Iterator<String> it=header.keys();it.hasNext();){String key=it.next();if(sent.length()>0)sent.append("; ");sent.append(encode(key)).append('=').append(encode(header.getString(key)));}
        JSONObject data=new JSONObject(payload.toString());data.put("header",header).put("e_r",false);List<String> received=new ArrayList<>();
        // One request per explicit tap; never retry a write after an ambiguous transport failure.
        JSONObject response=exchange(path.replaceFirst("^/api/","/eapi/"),NetEaseProtocol.clientForm(path,data),sent.toString(),received,true);
        for(String line:received)try{for(HttpCookie c:HttpCookie.parse(line))if("NMTID".equals(c.getName()))clientPreferences.edit().putString("nmtid",c.getValue()).apply();}catch(IllegalArgumentException ignored){}
        return checked(response);
    }
    private JSONObject playlist(String sid,Uri query)throws Exception {
        sid=id(sid);int offset=MusicLibrary.number(query.getQueryParameter("offset"),0,10000000),limit=MusicLibrary.number(query.getQueryParameter("limit"),40,50);
        if(limit<1)throw new IllegalArgumentException("无效的分页大小");
        String token=query.getQueryParameter("snapshot");PlaylistPage page;
        if(token==null||token.isEmpty()){
            if(offset!=0)throw new IllegalArgumentException("请先打开歌单");
            JSONObject p=object(request("/api/v6/playlist/detail?id="+sid+"&n=0&s=0"),"playlist");page=new PlaylistPage();page.id=sid;page.name=p.optString("name","歌单");page.art=p.optString("coverImgUrl");page.liked=p.optInt("specialType")==5;page.ids=MusicLibrary.ids(p);page.revision=MusicLibrary.revision(page.ids);
            token=UUID.randomUUID().toString();synchronized(libraryPages){libraryPages.put(token,page);}
        }else{
            if(!token.matches("[a-f0-9-]{36}"))throw new IllegalArgumentException("无效的歌单分页");
            synchronized(libraryPages){page=libraryPages.get(token);}if(page==null||!page.id.equals(sid))throw new IOException("歌单列表已刷新，请重新载入");
        }
        JSONArray ids=MusicLibrary.slice(page.ids,offset,limit),details=new JSONArray();
        if(ids.length()>0)details=array(request("/api/song/detail?ids="+encode(ids.toString())),"songs");
        int next=offset+ids.length();return obj("kind","playlist","id",sid,"name",page.name,"art",page.art,"is_liked",page.liked,"items",songs(MusicLibrary.ordered(ids,details)),"snapshot",token,"revision",page.revision,"offset",offset,"next_offset",next,"total",page.ids.length(),"has_more",next<page.ids.length());
    }
    JSONObject post(String action,JSONObject body)throws Exception {
        if(!"like".equals(action))throw new IllegalArgumentException("未找到音乐操作");
        if(cookie().isEmpty())throw new MusicServiceException(301);
        JSONObject payload=MusicLibrary.like(body);clientRequest("/api/radio/like",payload);
        return obj("id",payload.getString("trackId"),"liked",payload.getBoolean("like"));
    }
    private JSONObject playlistItem(JSONObject p)throws Exception {
        return obj("id",p.optString("id"),"kind","playlist","name",p.optString("name","歌单"),"art",p.optString("coverImgUrl",p.optString("picUrl")),"count",p.optInt("trackCount",p.optInt("trackCountUpdate")),"artist",object(p,"creator").optString("nickname"));
    }
    private String names(JSONArray artists) {StringBuilder s=new StringBuilder();for(int i=0;i<artists.length();i++){JSONObject a=artists.optJSONObject(i);if(a!=null&&!a.optString("name").isEmpty()){if(s.length()>0)s.append('、');s.append(a.optString("name"));}}return s.toString();}
    private JSONObject song(JSONObject s) throws Exception {JSONObject al=s.optJSONObject("al");if(al==null)al=object(s,"album");JSONArray ar=s.optJSONArray("ar");if(ar==null)ar=array(s,"artists");JSONObject lead=ar.optJSONObject(0);JSONObject out=obj("id",s.optString("id"),"title",s.optString("name","未知歌曲"),"artist",names(ar),"artistId",lead==null?"":lead.optString("id"),"artistName",lead==null?"":lead.optString("name"),"album",al.optString("name"),"art",al.optString("picUrl",s.optString("picUrl")),"duration",Math.round(s.optLong("dt",s.optLong("duration"))/1000.0));if(s.optBoolean("unavailable"))out.put("unavailable",true);return out;}
    private JSONArray songs(JSONArray list) throws Exception {JSONArray out=new JSONArray();for(int i=0;i<list.length();i++){JSONObject s=list.optJSONObject(i);if(s!=null)out.put(song(s));}return out;}
    private JSONObject artistItem(JSONObject a) throws Exception {return obj("id",a.optString("id"),"kind","artist","name",a.optString("name","未知歌手"),"art",a.optString("picUrl",a.optString("img1v1Url")),"count",a.optInt("albumSize"));}
    private JSONObject albumItem(JSONObject a) throws Exception {JSONArray ar=a.optJSONArray("artists");if(ar==null)ar=new JSONArray().put(object(a,"artist"));return obj("id",a.optString("id"),"kind","album","name",a.optString("name","未知专辑"),"art",a.optString("picUrl"),"artist",names(ar),"count",a.optInt("size"));}
    JSONObject get(String action,Uri q) throws Exception {
        String sid=q.getQueryParameter("id");
        if("status".equals(action)){if(cookie().isEmpty())return obj("configured",false,"signed_in",false);try{JSONObject a=request("/api/w/nuser/account/get");return obj("configured",true,"signed_in",object(a,"account").optLong("id")>0,"name",object(a,"profile").optString("nickname","网易云音乐"));}catch(Exception e){return obj("configured",true,"signed_in",false);}}
        if(cookie().isEmpty())throw new MusicServiceException(301);
        if("recommend-playlists".equals(action)){
            JSONArray list=array(weapi("/api/v1/discovery/recommend/resource",new JSONObject()),"recommend"),items=new JSONArray();
            for(int i=0;i<Math.min(30,list.length());i++)items.put(playlistItem(list.getJSONObject(i)));
            android.util.Log.i("HomeViewMusic","recommend-playlists:count="+items.length());return obj("items",items,"source","daily-recommend-resource");
        }
        if("daily".equals(action)){
            JSONObject result=weapi("/api/v3/discovery/recommend/songs",new JSONObject()),data=object(result,"data");
            JSONArray list=data.optJSONArray("dailySongs");if(list==null)list=result.optJSONArray("recommend");if(list==null)throw new IOException("音乐暂未返回每日推荐");
            android.util.Log.i("HomeViewMusic","daily:count="+list.length());return obj("name","每日推荐","items",songs(list));
        }
        if("likes".equals(action)){long uid=object(request("/api/w/nuser/account/get"),"account").optLong("id");if(uid==0)throw new IOException("请先登录音乐");JSONArray list=array(weapi("/api/song/like/get",obj("uid",uid)),"ids"),out=new JSONArray();for(int i=0;i<list.length();i++)out.put(id(list.getString(i)));return obj("ids",out);}
        if("playlists".equals(action)){long uid=object(request("/api/w/nuser/account/get"),"account").optLong("id");if(uid==0)throw new IOException("请先登录音乐");JSONArray list=array(request("/api/user/playlist?uid="+uid+"&limit=50&offset=0"),"playlist"),out=new JSONArray();for(int i=0;i<list.length();i++){JSONObject p=list.getJSONObject(i);out.put(obj("id",p.optString("id"),"name",p.optString("name","歌单"),"art",p.optString("coverImgUrl"),"count",p.optInt("trackCount"),"is_liked",p.optInt("specialType")==5));}return obj("items",out);}
        if("playlist".equals(action))return playlist(sid,q);
        if("comments".equals(action)){String song=id(sid);int offset=MusicLibrary.number(q.getQueryParameter("offset"),0,1000000);JSONObject result=weapi("/api/v1/resource/comments/R_SO_4_"+song,obj("rid",song,"limit",20,"offset",offset,"beforeTime",0));return MusicComments.page(song,offset,result);}
        if("lyrics".equals(action)){JSONObject p=request("/api/song/lyric?id="+id(sid)+"&lv=-1&tv=-1");return obj("text",object(p,"lrc").optString("lyric"),"translated",object(p,"tlyric").optString("lyric"));}
        if("play-url".equals(action)){JSONArray a=array(request("/api/song/enhance/player/url?id="+id(sid)+"&ids="+encode("["+sid+"]")+"&br=128000"),"data");JSONObject p=a.length()>0?a.getJSONObject(0):new JSONObject();String u=p.optString("url","");Uri v=Uri.parse(u);if(p.optJSONObject("freeTrialInfo")!=null||!http(v)||v.getHost()==null||!v.getHost().endsWith(".music.126.net")||v.getUserInfo()!=null)return obj("available",false,"reason","音乐暂未提供完整播放地址，轻点播放可重试");return obj("available",true,"url",u.startsWith("http:")?"https:"+u.substring(5):u,"duration",Math.round(p.optLong("time")/1000.0),"source","netease","source_name","音乐");}
        if("artist".equals(action)){JSONObject p=request("/api/artist/"+id(sid)),out=artistItem(object(p,"artist"));out.put("items",songs(array(p,"hotSongs")));return out;}
        if("album".equals(action)){JSONObject p=request("/api/album/"+id(sid)),al=object(p,"album"),out=albumItem(al);JSONArray ss=p.optJSONArray("songs");if(ss==null)ss=array(al,"songs");JSONArray list=songs(ss);for(int i=0;i<list.length();i++){JSONObject s=list.getJSONObject(i);if(s.optString("art").isEmpty())s.put("art",out.optString("art"));if(s.optString("album").isEmpty())s.put("album",out.optString("name"));}out.put("items",list);return out;}
        if("search".equals(action)){String text=q.getQueryParameter("q"),kind=q.getQueryParameter("type");if(text==null)text="";text=text.trim();if(text.length()>80)text=text.substring(0,80);if(kind==null)kind="song";int type="song".equals(kind)?1:"artist".equals(kind)?100:"album".equals(kind)?10:"playlist".equals(kind)?1000:0;if(type==0)throw new IllegalArgumentException("请选择歌曲、歌手、专辑或歌单");JSONArray out=new JSONArray();if(!text.isEmpty()){JSONObject r=object(request("/api/search/get?s="+encode(text)+"&type="+type+"&limit=30&offset=0"),"result");JSONArray list=array(r,type==1?"songs":type==100?"artists":type==1000?"playlists":"albums");for(int i=0;i<list.length();i++)out.put(type==1?song(list.getJSONObject(i)):type==100?artistItem(list.getJSONObject(i)):type==1000?playlistItem(list.getJSONObject(i)):albumItem(list.getJSONObject(i)));if(type==1&&out.length()>0){try{JSONArray ids=new JSONArray();for(int i=0;i<out.length();i++)ids.put(Long.parseLong(out.getJSONObject(i).optString("id")));JSONArray ds=array(request("/api/song/detail?ids="+encode(ids.toString())),"songs");Map<String,JSONObject> map=new HashMap<>();for(int i=0;i<ds.length();i++){JSONObject s=song(ds.getJSONObject(i));map.put(s.optString("id"),s);}for(int i=0;i<out.length();i++){JSONObject s=map.get(out.getJSONObject(i).optString("id"));if(s!=null)out.put(i,s);}}catch(Exception ignored){}}}if(type==1000)android.util.Log.i("HomeViewMusic","playlist-search:count="+out.length());return obj("kind",kind,"items",out);}
        throw new IllegalArgumentException("未找到音乐接口");
    }
    private static boolean http(Uri u){return "http".equals(u.getScheme())||"https".equals(u.getScheme());}
    private String mergeCookies(String before,List<String> headers,String body){Map<String,String> m=new LinkedHashMap<>();for(String source:new String[]{before,body})for(String part:source.split(";")){int eq=part.indexOf('=');if(eq>0)m.put(part.substring(0,eq).trim(),part.substring(eq+1).trim());}for(String line:headers)try{for(HttpCookie c:HttpCookie.parse(line))m.put(c.getName(),c.getValue());}catch(Exception ignored){}StringBuilder out=new StringBuilder();for(Map.Entry<String,String> e:m.entrySet()){if(out.length()>0)out.append("; ");out.append(e.getKey()).append('=').append(e.getValue());}return out.toString();}
    synchronized JSONObject qr(String action,JSONObject body) throws Exception {
        long now=System.currentTimeMillis();Iterator<QrSession> it=sessions.values().iterator();while(it.hasNext())if(now-it.next().created>300000)it.remove();
        if("start".equals(action)){List<String> h=new ArrayList<>();JSONObject p=exchange("/api/login/qrcode/unikey","type=3","",h);String key=p.optString("unikey",object(p,"data").optString("unikey"));if(p.optInt("code")!=200||key.isEmpty())throw new IOException("暂时无法生成二维码，请稍后再试");String token=UUID.randomUUID().toString();QrSession s=new QrSession();s.key=key;s.cookies=mergeCookies("os=pc",h,"");if(sessions.size()>3)sessions.clear();sessions.put(token,s);Map<EncodeHintType,Object> hints=new EnumMap<>(EncodeHintType.class);hints.put(EncodeHintType.ERROR_CORRECTION,ErrorCorrectionLevel.M);hints.put(EncodeHintType.MARGIN,2);BitMatrix bits=new QRCodeWriter().encode("https://music.163.com/login?codekey="+encode(key),BarcodeFormat.QR_CODE,1,1,hints);StringBuilder svg=new StringBuilder("<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 "+bits.getWidth()+" "+bits.getHeight()+"\"><path fill=\"white\" d=\"M0 0h"+bits.getWidth()+"v"+bits.getHeight()+"H0z\"/><path fill=\"#17212b\" d=\"");for(int y=0;y<bits.getHeight();y++)for(int x=0;x<bits.getWidth();x++)if(bits.get(x,y))svg.append('M').append(x).append(' ').append(y).append("h1v1h-1z");svg.append("\"/></svg>");return obj("session",token,"image","data:image/svg+xml;base64,"+Base64.encodeToString(svg.toString().getBytes("UTF-8"),Base64.NO_WRAP));}
        String token=body.optString("session");QrSession s=sessions.get(token);if(s==null)return obj("code",800,"message","二维码已过期");List<String> h=new ArrayList<>();JSONObject p=exchange("/api/login/qrcode/client/login","type=3&key="+encode(s.key),s.cookies,h);s.cookies=mergeCookies(s.cookies,h,p.optString("cookie"));int code=p.optInt("code",801);if(code==803){saveCookie(s.cookies);sessions.remove(token);}else if(code==800)sessions.remove(token);if(code!=800&&code!=802&&code!=803)code=801;return obj("code",code,"message",code==803?"登录成功":code==802?"请在手机上确认登录":code==800?"二维码已过期":"请用手机端扫码");
    }
    private URL artSource(String raw,int size) throws Exception {Uri u=Uri.parse(raw);String h=u.getHost();if(!http(u)||h==null||!h.endsWith(".music.126.net")||!h.split("\\.")[0].startsWith("p")||u.getUserInfo()!=null||(u.getPort()!=-1&&u.getPort()!=80&&u.getPort()!=443))throw new IllegalArgumentException("无效的封面地址");return new URL(u.buildUpon().scheme("https").authority(h).clearQuery().appendQueryParameter("param",size+"y"+size).fragment(null).build().toString());}
    byte[] artwork(String raw,int requested,boolean ambient) throws Exception {
        int size=ambient?96:Math.max(64,Math.min(768,requested));URL source=artSource(raw,size);String key=Base64.encodeToString(MessageDigest.getInstance("SHA-256").digest((source+"|"+ambient).getBytes("UTF-8")),Base64.NO_WRAP|Base64.URL_SAFE);File cache=new File(artDir,key+".jpg");if(cache.exists()){cache.setLastModified(System.currentTimeMillis());try(InputStream in=new FileInputStream(cache)){return read(in,4*1024*1024);}}
        HttpURLConnection c=(HttpURLConnection)source.openConnection();c.setConnectTimeout(8000);c.setReadTimeout(10000);c.setInstanceFollowRedirects(false);c.setRequestProperty("Referer","https://music.163.com/");byte[] data;try{if(c.getResponseCode()!=200)throw new IOException("封面暂时无法读取");try(InputStream in=c.getInputStream()){data=read(in,4*1024*1024);}}finally{c.disconnect();}
        BitmapFactory.Options opts=new BitmapFactory.Options();opts.inJustDecodeBounds=true;BitmapFactory.decodeByteArray(data,0,data.length,opts);if(opts.outWidth<=0||opts.outHeight<=0||(long)opts.outWidth*opts.outHeight>20000000)throw new IOException("封面尺寸无效");opts.inJustDecodeBounds=false;opts.inSampleSize=1;opts.inMutable=true;opts.inPreferredConfig=Bitmap.Config.RGB_565;while(Math.max(opts.outWidth,opts.outHeight)/opts.inSampleSize>size*2){opts.inSampleSize=opts.inSampleSize<1?2:opts.inSampleSize*2;}Bitmap image=BitmapFactory.decodeByteArray(data,0,data.length,opts);if(image==null)throw new IOException("无法读取封面");int side=Math.min(image.getWidth(),image.getHeight());Bitmap crop=Bitmap.createBitmap(image,(image.getWidth()-side)/2,(image.getHeight()-side)/2,side,side);Bitmap scaled=Bitmap.createScaledBitmap(crop,size,size,true);if(crop!=image&&crop!=scaled)crop.recycle();if(image!=scaled)image.recycle();if(ambient){if(!scaled.isMutable()){Bitmap m=scaled.copy(Bitmap.Config.ARGB_8888,true);scaled.recycle();scaled=m;}blur(scaled);}ByteArrayOutputStream out=new ByteArrayOutputStream();scaled.compress(Bitmap.CompressFormat.JPEG,ambient?70:80,out);scaled.recycle();data=out.toByteArray();synchronized(artDir){AtomicFile af=new AtomicFile(cache);FileOutputStream f=af.startWrite();try{f.write(data);af.finishWrite(f);}catch(Exception e){af.failWrite(f);}File[] files=artDir.listFiles();if(files!=null){long total=0;for(File a:files)total+=a.length();if(total>32*1024*1024){Arrays.sort(files,Comparator.comparingLong(File::lastModified));for(File a:files){long bytes=a.length();a.delete();total-=bytes;if(total<24*1024*1024)break;}}}}return data;
    }
    private static void blur(Bitmap b){int n=b.getWidth(),r=9;int[] a=new int[n*n],tmp=new int[n*n];b.getPixels(a,0,n,0,0,n,n);for(int pass=0;pass<6;pass++){for(int y=0;y<n;y++)for(int x=0;x<n;x++){int rr=0,g=0,bb=0;for(int k=-r;k<=r;k++){int c=a[y*n+Math.max(0,Math.min(n-1,x+k))];rr+=(c>>16)&255;g+=(c>>8)&255;bb+=c&255;}int d=r*2+1;tmp[x*n+y]=0xff000000|(rr/d<<16)|(g/d<<8)|bb/d;}int[] t=a;a=tmp;tmp=t;}b.setPixels(a,0,n,0,0,n,n);}
}
