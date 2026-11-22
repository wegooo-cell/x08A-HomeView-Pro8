package dev.pro8.homeview.direct;

import android.content.Context;
import android.net.Uri;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.*;
import java.net.*;
import java.util.*;
import java.util.concurrent.*;

/** Small bounded loopback server: no LAN listener and no external runtime. */
final class LocalWebServer implements Closeable {
    static final String HOME="http://127.0.0.1:8806/frame/hv/";
    private final Context context;
    private final String token;
    private final NetEaseClient music;
    private final HomeAssistantClient ha;
    private final LocalFamily family;
    private final LocalAlbum album;
    private final LocalWeather weather;
    private final LocalCalendar calendar;
    private final CalendarMobile calendarMobile;
    private final LocalAppearance appearance,desktopAppearance;
    private final Map<String,LocalAppearance> appAppearances=new HashMap<>();
    private final ServerSocket listener;
    private final ThreadPoolExecutor workers=new ThreadPoolExecutor(2,6,30,TimeUnit.SECONDS,new ArrayBlockingQueue<Runnable>(24));
    private volatile boolean running=true;
    LocalWebServer(Context context) throws Exception {
        this.context=context.getApplicationContext();music=new NetEaseClient(this.context);ha=((HomeViewApplication)this.context).ha();family=new LocalFamily(this.context,ha);
        weather=new LocalWeather(this.context);calendar=new LocalCalendar(this.context);
        calendarMobile=new CalendarMobile(name->{try(InputStream in=this.context.getAssets().open("frame/hv/calendar/phone/"+name)){return NetEaseClient.read(in,400000);}},data->{calendar.command("connect",data);});
        album=new LocalAlbum(this.context);appearance=new LocalAppearance(this.context,album);desktopAppearance=new LocalAppearance(this.context,album,appearance);
        for(String scope:LocalAppearance.SCOPES)appAppearances.put(scope,new LocalAppearance(this.context,album,scope));
        File key=new File(context.getFilesDir(),"local-session");if(!key.exists()){try(FileOutputStream out=new FileOutputStream(key)){out.write(UUID.randomUUID().toString().getBytes("UTF-8"));}}
        try(InputStream in=new FileInputStream(key)){token=new String(NetEaseClient.read(in,128),"UTF-8");}
        listener=new ServerSocket();
        try {listener.setReuseAddress(true);listener.bind(new InetSocketAddress(InetAddress.getByName("127.0.0.1"),8806),24);}
        catch(IOException e){listener.close();workers.shutdownNow();throw e;}
        Thread accept=new Thread(()->{while(running)try{final Socket s=listener.accept();s.setSoTimeout(8000);try{workers.execute(()->serve(s));}catch(RejectedExecutionException e){s.close();}}catch(IOException e){if(running)android.util.Log.w("HomeViewLocal","Local connection unavailable");}},"homeview-loopback");accept.setDaemon(true);accept.start();
    }
    Map<String,String> headers(){Map<String,String> h=new HashMap<>();h.put("X-HomeView-Local",token);return h;}
    boolean isRunning(){return running&&!listener.isClosed()&&!workers.isShutdown();}
    @Override public void close(){running=false;family.close();album.close();calendarMobile.close();weather.close();calendar.close();try{listener.close();}catch(Exception ignored){}workers.shutdownNow();}
    private String line(InputStream in,int limit) throws IOException {ByteArrayOutputStream out=new ByteArrayOutputStream();int c;while((c=in.read())!=-1){if(c=='\n')break;if(out.size()>=limit)throw new IOException("Header too long");if(c!='\r')out.write(c);}return out.toString("ISO-8859-1");}
    private void serve(Socket s){try(Socket socket=s){InputStream in=socket.getInputStream();OutputStream out=socket.getOutputStream();String[] first=line(in,4096).split(" ");if(first.length!=3)return;String method=first[0];Map<String,String> h=new HashMap<>();int bytes=0;while(true){String l=line(in,8192);bytes+=l.length();if(bytes>32768)throw new IOException("Headers too long");if(l.isEmpty())break;int p=l.indexOf(':');if(p>0)h.put(l.substring(0,p).trim().toLowerCase(Locale.ROOT),l.substring(p+1).trim());}
            if(!"127.0.0.1:8806".equals(h.get("host"))){send(out,403,"text/plain",new byte[0],false,false);return;}
            boolean bootstrap=token.equals(h.get("x-homeview-local")),auth=bootstrap;
            for(String pair:h.getOrDefault("cookie","").split(";"))if(pair.trim().equals("hv_local="+token))auth=true;
            Uri uri=Uri.parse(first[1]);String path=uri.getPath();if(path==null||!first[1].startsWith("/")||first[1].startsWith("//")||path.contains("..")||path.indexOf('\\')>=0){send(out,400,"text/plain",new byte[0],false,false);return;}
            if(!method.equals("GET")&&!method.equals("POST")&&!(method.equals("HEAD")&&(path.startsWith("/frame/")))){send(out,405,"text/plain",new byte[0],false,false);return;}
            if(path.startsWith("/api/")&&!auth){json(out,NetEaseClient.obj("ok",false,"error","请通过 HomeView 应用打开"),403);return;}
            if(method.equals("POST")&&!HOME.startsWith(h.getOrDefault("origin","_")+"/")){json(out,NetEaseClient.obj("ok",false,"error","来源无效"),403);return;}
            try{
                if(path.equals("/api/hv/profile-web-state")){if(method.equals("POST"))LocalFirstRun.finishWeb(context);json(out,LocalFirstRun.state(context),200);return;}
                if(path.equals("/api/hv/launcher-status")&&method.equals("GET")){json(out,LocalLauncherStatus.state(context),200);return;}
                if(path.equals("/api/hv/bilibili/widget")&&method.equals("GET")){json(out,((HomeViewApplication)context).bilibiliWidget().state(),200);return;}
                if(path.equals("/api/hv/bilibili/widget-cover")&&method.equals("GET")){send(out,200,"image/jpeg",((HomeViewApplication)context).bilibiliWidget().image(),false,false);return;}
                if(path.equals("/api/hv/installed-apps")&&method.equals("GET")){json(out,((HomeViewApplication)context).installedApps().state(),200);return;}
                if(path.equals("/api/hv/installed-apps/icon")&&method.equals("GET")){send(out,200,"image/png",((HomeViewApplication)context).installedApps().icon(uri.getQueryParameter("package")),false,false);return;}
                if(path.equals("/api/hv/files")&&method.equals("GET")){String raw=uri.getQueryParameter("offset");json(out,((HomeViewApplication)context).files().list(uri.getQueryParameter("id"),raw==null?0:Integer.parseInt(raw)),200);return;}
                if(path.equals("/api/hv/recent-apps")){LocalRecentApps recent=((HomeViewApplication)context).recentApps();if(method.equals("GET"))json(out,recent.state(),200);else{int len=Integer.parseInt(h.getOrDefault("content-length","0"));if(len<1||len>256)throw new IllegalArgumentException("请求无效");byte[] b=new byte[len];new DataInputStream(in).readFully(b);JSONObject data=new JSONObject(new String(b,"UTF-8"));if(!data.optString("action").equals("close"))throw new IllegalArgumentException("请求无效");json(out,recent.close(data.optString("id")),200);}return;}
                if(path.equals("/api/hv/weather/location")){if(method.equals("GET"))json(out,weather.settings(),200);else{int len=Integer.parseInt(h.getOrDefault("content-length","0"));if(len<1||len>4096)throw new IllegalArgumentException("城市请求无效");byte[] b=new byte[len];new DataInputStream(in).readFully(b);json(out,weather.change(new JSONObject(new String(b,"UTF-8"))),200);}return;}
                if(path.equals("/api/hv/weather/refresh")&&method.equals("POST")){json(out,weather.refresh(),200);return;}
                if(path.equals("/api/hv/weather/search")&&method.equals("GET")){json(out,weather.search(uri.getQueryParameter("q")),200);return;}
                if(path.equals("/ha/callback")){ha.exchange(uri.getQueryParameter("code"),uri.getQueryParameter("state"));send(out,200,"text/html; charset=utf-8","<!doctype html><meta charset=\"utf-8\"><script>location.replace('/frame/hv/')</script>".getBytes("UTF-8"),false,false);return;}
                if(path.equals("/api/hv/wallpaper")||path.equals("/api/ha/wallpaper")||path.equals("/api/hv/desktop-wallpaper")||path.equals("/api/hv/app-wallpaper")){LocalAppearance target=path.equals("/api/hv/app-wallpaper")?appAppearances.get(uri.getQueryParameter("app")):path.equals("/api/hv/desktop-wallpaper")?desktopAppearance:appearance;if(target==null)throw new IllegalArgumentException("请选择应用");if(method.equals("GET"))json(out,target.state(),200);else{int len=Integer.parseInt(h.getOrDefault("content-length","0"));if(len<0||len>1300000)throw new IllegalArgumentException("壁纸过大");byte[] b=new byte[len];new DataInputStream(in).readFully(b);json(out,target.change(new JSONObject(new String(b,"UTF-8"))),200);}return;}
                if(path.startsWith("/api/hv/calendar/")){String action=path.substring("/api/hv/calendar/".length());if(method.equals("GET")&&action.equals("mobile-status")){json(out,calendarMobile.state(uri.getQueryParameter("id")),200);return;}if(method.equals("GET")&&action.equals("mobile-qr")){send(out,200,"image/svg+xml",calendarQR(calendarMobile.url(uri.getQueryParameter("id"))),false,false);return;}if(method.equals("GET")&&action.equals("status")){json(out,calendar.status(),200);return;}if(method.equals("GET")&&action.equals("view")){json(out,calendar.view(uri.getQueryParameter("start"),uri.getQueryParameter("end")),200);return;}if(method.equals("POST")){int len=Integer.parseInt(h.getOrDefault("content-length","0"));if(len<0||len>128*1024)throw new IllegalArgumentException("日历请求过大");byte[] b=new byte[len];new DataInputStream(in).readFully(b);JSONObject data=new JSONObject(new String(b,"UTF-8"));if(action.equals("mobile-start")){if(calendar.status().optBoolean("busy"))throw new IllegalArgumentException("正在连接日历，请稍候");json(out,calendarMobile.start(wifiAddress()),200);}else if(action.equals("mobile-cancel"))json(out,calendarMobile.cancel(data.optString("id")),200);else json(out,calendar.command(action,data),200);return;}throw new IllegalArgumentException("日历请求无效");}
                if(path.equals("/api/frame/photos/delete")&&method.equals("POST")){int len=Integer.parseInt(h.getOrDefault("content-length","0"));if(len<1||len>8192)throw new IllegalArgumentException("照片请求无效");byte[] b=new byte[len];new DataInputStream(in).readFully(b);synchronized(album){Set<String> used=new HashSet<>();List<LocalAppearance> walls=new ArrayList<>(appAppearances.values());walls.add(appearance);walls.add(desktopAppearance);for(LocalAppearance wall:walls){JSONObject w=wall.state().getJSONObject("wallpaper");if(w.optString("t").equals("album"))used.add(w.optString("id"));}json(out,album.remove(new JSONObject(new String(b,"UTF-8")),used),200);}return;}
                if(path.equals("/api/frame/photos")&&method.equals("GET")){json(out,album.listing(),200);return;}
                if(path.startsWith("/api/frame/photo/import-")&&method.equals("GET")){try{byte[] b=album.image(uri);send(out,200,path.endsWith(".webp")?"image/webp":"image/jpeg",b,false,true);}catch(FileNotFoundException e){send(out,404,"text/plain",new byte[0],false,false);}return;}
                if(path.startsWith("/api/airplay/")){LocalAirPlay receiver=((HomeViewApplication)context).airplay();if(method.equals("GET")&&path.equals("/api/airplay/state")){json(out,receiver.state(),200);return;}if(method.equals("GET")&&path.equals("/api/airplay/art")){try{send(out,200,"image/jpeg",receiver.artwork("1".equals(uri.getQueryParameter("ambient"))),false,true);}catch(FileNotFoundException e){send(out,404,"text/plain",new byte[0],false,false);}return;}if(method.equals("POST")&&path.equals("/api/airplay/control")){int len=Integer.parseInt(h.getOrDefault("content-length","0"));if(len<0||len>256)throw new IllegalArgumentException("请求过大");byte[] b=new byte[len];new DataInputStream(in).readFully(b);json(out,receiver.control(new JSONObject(new String(b,"UTF-8")).optString("action")),200);return;}if(method.equals("POST")&&path.equals("/api/airplay/start")){context.startForegroundService(new android.content.Intent(context,AirPlayService.class));json(out,NetEaseClient.obj("ok",true),200);return;}if(method.equals("POST")&&path.equals("/api/airplay/stop")){if(!context.stopService(new android.content.Intent(context,AirPlayService.class)))receiver.stop();json(out,NetEaseClient.obj("ok",true),200);return;}throw new IllegalArgumentException("请求无效");}
                if(path.startsWith("/api/ha/")){String action=path.substring(8);JSONObject result;if(method.equals("GET")&&action.equals("status"))result=family.status();else if(method.equals("GET")&&action.equals("entities"))result=family.entities();else if(method.equals("POST")){int len=Integer.parseInt(h.getOrDefault("content-length","0"));if(len<0||len>4096)throw new IllegalArgumentException("请求过大");byte[] b=new byte[len];new DataInputStream(in).readFully(b);JSONObject data=new JSONObject(new String(b,"UTF-8"));if(action.equals("provider"))result=family.select(data);else if(action.equals("login"))result=ha.login();else if(action.equals("name"))result=ha.rename(data);else if(action.equals("pins"))result=family.pins(data);else if(action.equals("control"))result=family.control(data);else throw new IllegalArgumentException("请求无效");}else throw new IllegalArgumentException("请求无效");json(out,result,200);return;}
                if(path.startsWith("/api/frame/netease/")){String action=path.substring("/api/frame/netease/".length());if(method.equals("GET")&&action.equals("art")){String size=uri.getQueryParameter("size");byte[] b=music.artwork(uri.getQueryParameter("url"),size==null?512:Integer.parseInt(size),"1".equals(uri.getQueryParameter("ambient")));send(out,200,"image/jpeg",b,false,true);return;}JSONObject result;
                    if(method.equals("GET"))result=music.get(action,uri);else{int length=Integer.parseInt(h.getOrDefault("content-length","0"));if(length<0||length>8192)throw new IllegalArgumentException("请求过大");byte[] body=new byte[length];int offset=0,n;while(offset<length&&(n=in.read(body,offset,length-offset))>0)offset+=n;if(offset!=length)throw new IOException("请求不完整");JSONObject data=new JSONObject(length==0?"{}":new String(body,"UTF-8"));if(action.equals("like"))result=music.post(action,data);else if(action.equals("qr/start")||action.equals("qr/check"))result=music.qr(action.substring(3),data);else throw new IllegalArgumentException("请求无效");}result.put("ok",true);json(out,result,200);return;}
                if(path.equals("/api/local/config")){json(out,NetEaseClient.obj("ok",true,"ha_configured",!ha.base().isEmpty()),200);return;}
                if(path.equals("/api/local/health")){json(out,NetEaseClient.obj("ok",true,"runtime","android","independent_music",true,"independent_photos",true,"independent_wallpaper",true,"version",context.getPackageManager().getPackageInfo(context.getPackageName(),0).versionCode),200);return;}
                if(path.equals("/api/hv/state")){json(out,NetEaseClient.obj("ok",true,"now",System.currentTimeMillis()/1000.0,"timers",LocalTimers.list(context),"command",JSONObject.NULL),200);return;}
                if(path.equals("/api/hv/clock")&&method.equals("GET")){json(out,LocalClock.state(context),200);return;}
                if(path.equals("/api/hv/clock")&&method.equals("POST")){int len=Integer.parseInt(h.getOrDefault("content-length","0"));if(len<0||len>8192)throw new IllegalArgumentException("请求过大");byte[] b=new byte[len];new DataInputStream(in).readFully(b);json(out,LocalClock.command(context,new JSONObject(new String(b,"UTF-8"))),200);return;}
                if(path.equals("/api/hv/timer")&&method.equals("GET")){json(out,LocalTimers.state(context),200);return;}
                if(path.equals("/api/hv/timer")&&method.equals("POST")){int len=Integer.parseInt(h.getOrDefault("content-length","0"));if(len<0||len>4096)throw new IllegalArgumentException("请求过大");byte[] b=new byte[len];new DataInputStream(in).readFully(b);json(out,LocalTimers.change(context,new JSONObject(new String(b,"UTF-8"))),200);return;}
                if(path.equals("/api/hv/wallpapers")){json(out,NetEaseClient.obj("ok",true,"wallpapers",new JSONArray()),200);return;}
                if(path.equals("/api/frame/music")||path.startsWith("/api/frame/spotify")){json(out,NetEaseClient.obj("ok",false,"error","此音乐接口不可用"),404);return;}
                if(path.startsWith("/api/")){optionalApi(out,path,uri,method);return;}
                if(path.equals("/")||path.equals("/frame/hv")){path="/frame/hv/";}if(path.endsWith("/"))path+="index.html";
                boolean font=path.startsWith("/frame/hv/fonts/")&&path.endsWith(".woff2");
                InputStream asset;try{asset=context.getAssets().open(path.equals("/frame/hv/config.js")?"config.js":path.substring(1));}catch(IOException e){send(out,404,"text/plain","Not found".getBytes("UTF-8"),false,false);return;}
                String mime=path.endsWith(".html")?"text/html; charset=utf-8":path.endsWith(".js")?"application/javascript; charset=utf-8":path.endsWith(".css")?"text/css; charset=utf-8":path.endsWith(".svg")?"image/svg+xml":path.endsWith(".png")?"image/png":path.endsWith(".webp")?"image/webp":path.endsWith(".woff2")?"font/woff2":"image/jpeg";
                // AssetInputStream.available() is the remaining packaged asset
                // length. Stream it directly instead of allocating and copying
                // multiple multi-megabyte font arrays in the request workers.
                try(InputStream input=asset){int length=input.available();if(length<0||length>(font?8:5)*1024*1024)throw new IOException("Asset too large");
                    boolean cache=!path.endsWith(".html")&&!path.equals("/frame/hv/config.js");
                    head(out,200,mime,length,bootstrap,cache);
                    if(!method.equals("HEAD")){byte[] buffer=new byte[16384];int remaining=length,n;while(remaining>0&&(n=input.read(buffer,0,Math.min(remaining,buffer.length)))!=-1){out.write(buffer,0,n);remaining-=n;}if(remaining!=0)throw new EOFException();}out.flush();}
            }catch(Exception error){json(out,NetEaseClient.obj("ok",false,"error",(error instanceof IllegalArgumentException||error instanceof MusicServiceException)?error.getMessage():"网络暂时不可用，请检查 Pro 8 的 Wi-Fi 或稍后重试"),503);}
        }catch(Exception ignored){} }
    private void optionalApi(OutputStream out,String path,Uri uri,String method) throws Exception {
        // Existing non-music data may still come from an optional household server.
        // A failure never affects local Home, clocks, or NetEase playback.
        String server=context.getSharedPreferences("homeview_pro8",0).getString("server_url",HomeActivity.DEFAULT_SERVER);
        if(method.equals("GET")&&!server.isEmpty())try{URL base=new URL(server);if(!base.getHost().equals("127.0.0.1")){HttpURLConnection c=(HttpURLConnection)new URL(base.getProtocol(),base.getHost(),base.getPort(),uri.toString()).openConnection();c.setConnectTimeout(900);c.setReadTimeout(1400);try{if(c.getResponseCode()==200){byte[] b;try(InputStream in=c.getInputStream()){b=NetEaseClient.read(in,2*1024*1024);}String type=c.getContentType();if(path.equals("/api/frame")){JSONObject d=new JSONObject(new String(b,"UTF-8"));{JSONObject local=weather.state();for(Iterator<String> keys=local.keys();keys.hasNext();){String k=keys.next();if(!k.equals("calendar_events"))d.put(k,local.get(k));}json(out,calendar.appendFrame(d),200);return;}}send(out,200,type==null?"application/json; charset=utf-8":type,b,false,false);return;}}finally{c.disconnect();}}}catch(Exception ignored){}
        if(path.equals("/api/frame"))json(out,calendar.appendFrame(weather.state()),200);
        else if(path.equals("/api/frame/photos"))json(out,NetEaseClient.obj("ok",true,"photos",new JSONArray()),200);
        else if(path.equals("/api/meals/plan"))json(out,NetEaseClient.obj("ok",true,"days",new JSONArray()),200);
        else if(path.equals("/api/meals/shopping"))json(out,NetEaseClient.obj("ok",true,"items",new JSONArray()),200);
        else json(out,NetEaseClient.obj("ok",false,"error","此家庭数据需要连接原服务器"),503);
    }
    private InetAddress wifiAddress()throws Exception {
        android.net.ConnectivityManager manager=(android.net.ConnectivityManager)context.getSystemService(Context.CONNECTIVITY_SERVICE);
        android.net.NetworkInfo network=manager==null?null:manager.getActiveNetworkInfo();
        if(network==null||!network.isConnected()||network.getType()!=android.net.ConnectivityManager.TYPE_WIFI)throw new IllegalArgumentException("请先让 Pro8 连接家庭 Wi-Fi，再扫码填写");
        android.net.wifi.WifiManager wifi=(android.net.wifi.WifiManager)context.getApplicationContext().getSystemService(Context.WIFI_SERVICE);
        int ip=wifi==null||wifi.getConnectionInfo()==null?0:wifi.getConnectionInfo().getIpAddress();
        InetAddress address=InetAddress.getByAddress(new byte[]{(byte)ip,(byte)(ip>>8),(byte)(ip>>16),(byte)(ip>>24)});
        if(!address.isSiteLocalAddress()||NetworkInterface.getByInetAddress(address)==null)throw new IllegalArgumentException("暂时没有可用的家庭 Wi-Fi 地址，请重连后再试");return address;
    }
    private byte[] calendarQR(String url)throws Exception {
        Map<com.google.zxing.EncodeHintType,Object> hints=new EnumMap<>(com.google.zxing.EncodeHintType.class);hints.put(com.google.zxing.EncodeHintType.MARGIN,4);hints.put(com.google.zxing.EncodeHintType.ERROR_CORRECTION,com.google.zxing.qrcode.decoder.ErrorCorrectionLevel.M);
        com.google.zxing.common.BitMatrix bits=new com.google.zxing.qrcode.QRCodeWriter().encode(url,com.google.zxing.BarcodeFormat.QR_CODE,1,1,hints);
        StringBuilder svg=new StringBuilder("<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 "+bits.getWidth()+" "+bits.getHeight()+"\" shape-rendering=\"crispEdges\"><path fill=\"white\" d=\"M0 0h"+bits.getWidth()+"v"+bits.getHeight()+"H0z\"/><path fill=\"#17212b\" d=\"");
        for(int y=0;y<bits.getHeight();y++)for(int x=0;x<bits.getWidth();x++)if(bits.get(x,y))svg.append('M').append(x).append(' ').append(y).append("h1v1h-1z");return svg.append("\"/></svg>").toString().getBytes("UTF-8");
    }
    private void json(OutputStream out,JSONObject body,int status) throws IOException {send(out,status,"application/json; charset=utf-8",body.toString().getBytes("UTF-8"),false,false);}
    private void send(OutputStream out,int status,String type,byte[] body,boolean bootstrap,boolean art) throws IOException {
        head(out,status,type,body.length,bootstrap,art);out.write(body);out.flush();
    }
    private void head(OutputStream out,int status,String type,int length,boolean bootstrap,boolean cache)throws IOException{
        String headers="HTTP/1.1 "+status+" "+(status==200?"OK":"Error")+"\r\nContent-Type: "+type+"\r\nContent-Length: "+length+"\r\nConnection: close\r\nX-Content-Type-Options: nosniff\r\nCache-Control: "+(cache?"private, max-age=86400":"no-store")+"\r\n"+(bootstrap?"Set-Cookie: hv_local="+token+"; Path=/; HttpOnly; SameSite=Strict\r\n":"")+"\r\n";
        out.write(headers.getBytes("UTF-8"));
    }
}
