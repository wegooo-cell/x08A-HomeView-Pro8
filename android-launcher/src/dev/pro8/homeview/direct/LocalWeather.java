package dev.pro8.homeview.direct;

import android.content.Context;
import android.util.AtomicFile;
import org.json.*;
import java.io.*;
import java.net.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.function.LongSupplier;
import java.util.zip.GZIPInputStream;

/** One configured city; network work never holds the UI or loopback request. */
final class LocalWeather implements Closeable {
    private static final long FRESH_MS=900000,RETRY_MS=60000;
    private static final Set<String> ZONES=new HashSet<>(Arrays.asList(TimeZone.getAvailableIDs()));
    interface Fetcher { JSONObject get(String url,int timeout)throws Exception; }
    private final Fetcher fetcher;
    private final LongSupplier clock;
    private CitySearch citySearch=new CitySearch();
    private final AtomicFile config,cache;
    private final File legacy;
    private final ExecutorService worker=new ThreadPoolExecutor(1,1,0,TimeUnit.SECONDS,new ArrayBlockingQueue<Runnable>(4),new ThreadPoolExecutor.DiscardOldestPolicy());
    private JSONObject location,saved;
    private long lastAttempt,generation;
    private boolean loading,closed,forceNext;
    private String lastError="";
    LocalWeather(Context context){
        this(context.getFilesDir(),LocalWeather::get);
        try{citySearch=new CitySearch(context.getAssets().open("frame/hv/weather/provinces.tsv"));}
        catch(IOException e){throw new IllegalStateException("City search rules unavailable",e);}
    }
    LocalWeather(File directory,Fetcher fetcher){this(directory,fetcher,System::currentTimeMillis);}
    LocalWeather(File directory,Fetcher fetcher,LongSupplier clock){
        this.fetcher=fetcher;this.clock=clock;
        config=new AtomicFile(new File(directory,"weather-location.json"));cache=new AtomicFile(new File(directory,"weather-cache-v3.json"));
        legacy=new File(directory,"weather-cache-v2.json");
        try(InputStream in=config.openRead()){location=normalize(new JSONObject(new String(read(in,16384),"UTF-8")));}catch(Exception ignored){}
        try(InputStream in=cache.openRead()){
            JSONObject candidate=new JSONObject(new String(read(in,512*1024),"UTF-8"));
            if(location!=null&&candidate.optInt("cache_version")==3&&key(location).equals(candidate.optString("location_key"))&&candidate.optJSONObject("weather")!=null)saved=candidate;
        }catch(Exception ignored){}
        if(saved==null&&location!=null)try(InputStream in=new FileInputStream(legacy)){
            JSONObject candidate=new JSONObject(new String(read(in,512*1024),"UTF-8"));
            if(key(location).equals(candidate.optString("location_key"))&&candidate.optJSONObject("weather")!=null)saved=candidate;
        }catch(Exception ignored){}
    }
    synchronized JSONObject settings()throws Exception{return new JSONObject().put("ok",true).put("configured",location!=null).put("location",location==null?JSONObject.NULL:new JSONObject(location.toString()));}
    synchronized JSONObject change(JSONObject input)throws Exception{
        JSONObject next=normalize(input);FileOutputStream out=null;
        try{out=config.startWrite();out.write(next.toString().getBytes("UTF-8"));config.finishWrite(out);}catch(IOException e){if(out!=null)config.failWrite(out);throw e;}
        location=next;generation++;saved=null;lastAttempt=0;loading=false;lastError="";cache.delete();legacy.delete();
        return settings();
    }
    JSONObject search(String query) throws Exception {
        query=query==null?"":query.trim();
        if(query.length()<2||query.length()>80||query.matches("(?s).*[\\p{Cntrl}].*"))throw new IllegalArgumentException("请输入2至80个字的城市名");
        citySearch.plans(query);
        try{
            JSONArray domestic=WeatherCities.search(query,citySearch,url->fetcher.get(url,4500));
            if(domestic.length()>0)return new JSONObject().put("ok",true).put("results",domestic);
        }catch(IllegalArgumentException e){throw e;}catch(Exception ignored){}
        JSONArray cities=new JSONArray();
        for(CitySearch.Query plan:citySearch.plans(query)){
            JSONObject raw=fetcher.get("https://geocoding-api.open-meteo.com/v1/search?name="+encode(plan.name)+"&count=20&language=zh&format=json"+(plan.country.isEmpty()?"":"&countryCode="+plan.country),4500);
            JSONArray results=raw.optJSONArray("results");List<JSONObject> valid=new ArrayList<>();
            if(results!=null)for(int i=0;i<results.length();i++)try{
                JSONObject row=results.getJSONObject(i);String code=row.optString("feature_code");
                if(CitySearch.rank(code)==99||!CitySearch.acceptName(plan.name,row.optString("name")))continue;
                row.put("admin1",citySearch.admin(row.optString("admin1"),row.optString("country_code")));
                JSONObject value=normalize(row);value.put("population",row.optLong("population"));valid.add(value);
            }catch(Exception ignored){}
            Collections.sort(valid,(a,b)->{
                int rank=Integer.compare(CitySearch.rank(a.optString("feature_code")),CitySearch.rank(b.optString("feature_code")));
                return rank!=0?rank:Long.compare(b.optLong("population"),a.optLong("population"));
            });
            Set<String> seen=new HashSet<>();
            for(JSONObject row:valid){row.remove("population");if(seen.add(key(row)))cities.put(row);if(cities.length()>=10)break;}
            if(cities.length()>0)break;
        }
        return new JSONObject().put("ok",true).put("results",cities);
    }
    static JSONObject normalize(JSONObject input) throws Exception {
        Object a=input.opt("latitude"),b=input.opt("longitude");
        if(!(a instanceof Number)||!(b instanceof Number))throw new IllegalArgumentException("请选择搜索结果中的城市");
        double lat=((Number)a).doubleValue(),lon=((Number)b).doubleValue();
        if(!Double.isFinite(lat)||!Double.isFinite(lon)||lat < -90||lat > 90||lon < -180||lon > 180)throw new IllegalArgumentException("城市坐标无效");
        String name=clean(input.optString("name"),80),zone=clean(input.optString("timezone"),80);
        if(name.isEmpty()||!ZONES.contains(zone))throw new IllegalArgumentException("城市名称或时区无效");
        JSONObject value=new JSONObject().put("name",name).put("latitude",lat).put("longitude",lon).put("timezone",zone)
            .put("country",clean(input.optString("country"),80)).put("admin1",clean(input.optString("admin1"),80));
        if(input.has("admin2"))value.put("admin2",clean(input.optString("admin2"),80));
        if(input.has("feature_code")){
            String code=clean(input.optString("feature_code"),8);
            if(!code.matches("PPL[A-Z0-9]{0,4}"))throw new IllegalArgumentException("地点类型无效");
            value.put("feature_code",code);
        }
        if(input.has("adcode")){
            String code=clean(input.optString("adcode"),6);
            if(!code.matches("[0-9]{6}"))throw new IllegalArgumentException("城市代码无效");
            value.put("adcode",code);
        }
        return value;
    }
    private static String clean(String value,int max){value=value.trim();if(value.length()>max||value.matches("(?s).*[\\p{Cntrl}].*"))throw new IllegalArgumentException("城市信息无效");return value;}
    static String key(JSONObject loc){return loc.optString("name")+"\n"+loc.optDouble("latitude")+"\n"+loc.optDouble("longitude")+"\n"+loc.optString("timezone");}
    private static String encode(String value)throws Exception{return URLEncoder.encode(value,"UTF-8");}
    synchronized JSONObject state()throws Exception{
        long now=clock.getAsLong();
        if(location!=null&&!closed&&!loading&&(forceNext||saved==null||saved.optInt("cache_version")!=3||now-saved.optLong("fetched_at")>FRESH_MS||now<saved.optLong("fetched_at")||!lastError.isEmpty())&&(lastAttempt==0||now<lastAttempt||now-lastAttempt>=RETRY_MS)){
            final JSONObject requested=new JSONObject(location.toString());final long revision=generation;loading=true;lastAttempt=now;forceNext=false;
            worker.execute(()->update(requested,revision,now));
        }
        return result();
    }
    private void update(JSONObject requested,long revision,long now){
        synchronized(this){if(closed||revision!=generation)return;}
        try{
            JSONObject fresh=WeatherProviders.fetch(requested,now,(url,timeout)->fetcher.get(url,timeout));
            synchronized(this){if(!closed&&revision==generation){saved=fresh;lastError="";persist();}}
        }catch(Exception failure){synchronized(this){if(!closed&&revision==generation)lastError="天气源暂不可用，将自动重试";}android.util.Log.w("HomeViewWeather","Both weather sources unavailable: "+failure.getClass().getSimpleName());}
        finally{synchronized(this){if(revision==generation)loading=false;}}
    }
    synchronized JSONObject refresh()throws Exception{if(!loading){lastAttempt=0;forceNext=true;}return state();}
    private JSONObject result()throws Exception{
        JSONObject out=saved==null?new JSONObject().put("ok",true).put("weather",JSONObject.NULL).put("aqi",JSONObject.NULL):new JSONObject(saved.toString());
        long now=clock.getAsLong();boolean stale=saved==null||saved.optInt("cache_version")!=3||now-saved.optLong("fetched_at")>FRESH_MS||now<saved.optLong("fetched_at")||!lastError.isEmpty();
        return out.put("city",location==null?"未设置城市":location.getString("name")).put("location",location==null?JSONObject.NULL:new JSONObject(location.toString()))
            .put("location_key",location==null?"":key(location)).put("requires_location",location==null).put("loading",loading).put("weather_error",lastError)
            .put("stale",stale).put("cached",saved!=null&&(stale||loading)).put("calendar_events",new JSONArray());
    }
    private void persist(){FileOutputStream out=null;try{out=cache.startWrite();out.write(saved.toString().getBytes("UTF-8"));cache.finishWrite(out);legacy.delete();}catch(Exception ignored){if(out!=null)cache.failWrite(out);}}
    private static byte[] read(InputStream in,int max)throws IOException{ByteArrayOutputStream out=new ByteArrayOutputStream();byte[] b=new byte[8192];int n;while((n=in.read(b))!=-1){out.write(b,0,n);if(out.size()>max)throw new IOException("Weather response too large");}return out.toByteArray();}
    static JSONObject get(String url,int timeout)throws Exception{
        long deadline=System.nanoTime()+TimeUnit.MILLISECONDS.toNanos(timeout);
        HttpURLConnection c=(HttpURLConnection)new URL(url).openConnection();c.setConnectTimeout(timeout);c.setReadTimeout(timeout);c.setInstanceFollowRedirects(false);c.setRequestProperty("Accept-Encoding","gzip");c.setRequestProperty("User-Agent","HomeView-Pro8/3 (personal weather display)");
        try{
            if(c.getResponseCode()!=200)throw new IOException("Weather source unavailable");
            InputStream stream=c.getInputStream();if("gzip".equalsIgnoreCase(c.getContentEncoding()))stream=new GZIPInputStream(stream);
            try(InputStream in=stream;ByteArrayOutputStream out=new ByteArrayOutputStream()){
                byte[] b=new byte[8192];int n;
                while(true){long left=TimeUnit.NANOSECONDS.toMillis(deadline-System.nanoTime());if(left<=0)throw new SocketTimeoutException();c.setReadTimeout((int)Math.max(1,left));n=in.read(b);if(n==-1)break;out.write(b,0,n);if(out.size()>512*1024)throw new IOException("Weather response too large");}
                return new JSONObject(out.toString("UTF-8"));
            }
        }finally{c.disconnect();}
    }
    @Override public synchronized void close(){closed=true;generation++;worker.shutdownNow();}
}
