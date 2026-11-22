package dev.pro8.homeview.direct;

import android.content.Context;
import android.util.AtomicFile;
import org.json.*;
import java.io.*;
import java.net.*;
import java.text.SimpleDateFormat;
import java.util.*;
import java.util.concurrent.*;

/** One persisted location for forecast, air quality and all weather labels. */
final class LocalWeather implements Closeable {
    private static final long FRESH_MS=900000, RETRY_MS=60000;
    private static final Set<String> ZONES=new HashSet<>(Arrays.asList(TimeZone.getAvailableIDs()));
    interface Fetcher { JSONObject get(String url,int timeout) throws Exception; }
    private final Fetcher fetcher;
    private final File cache,legacy;
    private final AtomicFile config;
    private final ExecutorService airWorker=new ThreadPoolExecutor(1,1,0,TimeUnit.SECONDS,new ArrayBlockingQueue<Runnable>(1),new ThreadPoolExecutor.DiscardOldestPolicy());
    private JSONObject location,saved;
    private long lastAttempt,generation;
    private boolean loading,closed;
    private String lastError="";
    LocalWeather(Context context){this(context.getFilesDir(),LocalWeather::get);}
    LocalWeather(File directory,Fetcher fetcher){
        this.fetcher=fetcher;
        config=new AtomicFile(new File(directory,"weather-location.json"));
        cache=new File(directory,"weather-cache-v2.json");legacy=new File(directory,"weather-beijing.json");
        legacy.delete();
        try(InputStream in=config.openRead()){location=normalize(new JSONObject(new String(NetEaseClient.read(in,16384),"UTF-8")));}catch(Exception ignored){}
        try(InputStream in=new AtomicFile(cache).openRead()){
            JSONObject candidate=new JSONObject(new String(NetEaseClient.read(in,256*1024),"UTF-8"));
            if(location!=null&&candidate.optInt("cache_version")==2&&key(location).equals(candidate.optString("location_key"))&&candidate.optJSONObject("weather")!=null)saved=candidate;
        }catch(Exception ignored){}
        if(saved==null)new AtomicFile(cache).delete();
    }
    synchronized JSONObject settings() throws Exception {
        return new JSONObject().put("ok",true).put("configured",location!=null).put("location",location==null?JSONObject.NULL:new JSONObject(location.toString()));
    }
    synchronized JSONObject change(JSONObject input) throws Exception {
        JSONObject next=normalize(input);FileOutputStream out=null;
        try{out=config.startWrite();out.write(next.toString().getBytes("UTF-8"));config.finishWrite(out);}catch(IOException e){if(out!=null)config.failWrite(out);throw e;}
        location=next;generation++;saved=null;lastAttempt=0;loading=false;lastError="";
        new AtomicFile(cache).delete();legacy.delete();
        return settings();
    }
    JSONObject search(String query) throws Exception {
        query=query==null?"":query.trim();
        if(query.length()<2||query.length()>80||query.matches("(?s).*[\\p{Cntrl}].*"))throw new IllegalArgumentException("请输入2至80个字的城市名");
        JSONObject raw=fetcher.get("https://geocoding-api.open-meteo.com/v1/search?name="+encode(query)+"&count=10&language=zh&format=json",4500);
        JSONArray results=raw.optJSONArray("results"),cities=new JSONArray();
        if(results!=null)for(int i=0;i<Math.min(10,results.length());i++)try{cities.put(normalize(results.getJSONObject(i)));}catch(Exception ignored){}
        return new JSONObject().put("ok",true).put("results",cities);
    }
    static JSONObject normalize(JSONObject input) throws Exception {
        Object a=input.opt("latitude"),b=input.opt("longitude");
        if(!(a instanceof Number)||!(b instanceof Number))throw new IllegalArgumentException("请选择搜索结果中的城市");
        double lat=((Number)a).doubleValue(),lon=((Number)b).doubleValue();
        if(!Double.isFinite(lat)||!Double.isFinite(lon)||lat < -90||lat > 90||lon < -180||lon > 180)throw new IllegalArgumentException("城市坐标无效");
        String name=clean(input.optString("name"),80),zone=clean(input.optString("timezone"),80);
        if(name.isEmpty()||!ZONES.contains(zone))throw new IllegalArgumentException("城市名称或时区无效");
        return new JSONObject().put("name",name).put("latitude",lat).put("longitude",lon).put("timezone",zone)
            .put("country",clean(input.optString("country"),80)).put("admin1",clean(input.optString("admin1"),80));
    }
    private static String clean(String value,int max){value=value.trim();if(value.length()>max||value.matches("(?s).*[\\p{Cntrl}].*"))throw new IllegalArgumentException("城市信息无效");return value;}
    private static String key(JSONObject loc){return loc.optString("name")+"\n"+loc.optDouble("latitude")+"\n"+loc.optDouble("longitude")+"\n"+loc.optString("timezone");}
    private static String encode(String value)throws Exception{return URLEncoder.encode(value,"UTF-8");}
    static String forecastUrl(JSONObject loc)throws Exception{
        return "https://api.open-meteo.com/v1/forecast?"+coordinates(loc)+"&forecast_days=7&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m&hourly=temperature_2m,relative_humidity_2m,weather_code,precipitation_probability,wind_speed_10m,visibility,uv_index,is_day&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_probability_max,wind_speed_10m_max";
    }
    static String airUrl(JSONObject loc)throws Exception{return "https://air-quality-api.open-meteo.com/v1/air-quality?"+coordinates(loc)+"&current=us_aqi";}
    private static String coordinates(JSONObject loc)throws Exception{return "latitude="+loc.getDouble("latitude")+"&longitude="+loc.getDouble("longitude")+"&timezone="+encode(loc.getString("timezone"));}
    JSONObject state() throws Exception {
        final JSONObject requested;final long revision,attempt;boolean fetch=false;
        synchronized(this){
            if(location==null||closed)return result();
            requested=new JSONObject(location.toString());revision=generation;attempt=System.currentTimeMillis();
            if(!loading&&(saved==null||attempt-saved.optLong("fetched_at")>FRESH_MS)&&(lastAttempt==0||attempt-lastAttempt>RETRY_MS)){
                loading=true;lastAttempt=attempt;fetch=true;
            }
        }
        if(fetch)try{
            JSONObject fresh=forecast(fetcher.get(forecastUrl(requested),12000),requested,attempt);
            boolean accepted=false;
            synchronized(this){if(!closed&&revision==generation){saved=fresh;lastError="";persist();accepted=true;}}
            if(accepted)airWorker.execute(()->{
                synchronized(LocalWeather.this){if(closed||revision!=generation)return;}
                try{
                    JSONObject air=fetcher.get(airUrl(requested),1800).getJSONObject("current");Object value=number(air,"us_aqi");
                    if(!(value instanceof Number))return;int aqi=((Number)value).intValue();if(aqi<0)return;
                    String band=aqi<=50?"good":aqi<=100?"moderate":aqi<=150?"unhealthy for sensitive groups":aqi<=200?"unhealthy":aqi<=300?"very unhealthy":"hazardous";
                    synchronized(LocalWeather.this){if(!closed&&revision==generation&&saved!=null&&saved.optLong("fetched_at")==attempt){saved.put("aqi",new JSONObject().put("us_aqi",aqi).put("band",band));persist();}}
                }catch(Exception ignored){}
            });
        }catch(Exception failure){
            synchronized(this){if(!closed&&revision==generation)lastError=failure instanceof SocketTimeoutException?"天气服务响应超时，可点击刷新重试":failure instanceof UnknownHostException?"暂时无法连接天气服务，请检查网络后重试":"天气服务暂不可用，可点击刷新重试";}
            android.util.Log.w("HomeViewWeather","Forecast unavailable: "+failure.getClass().getSimpleName());}
        finally{synchronized(this){if(revision==generation)loading=false;}}
        synchronized(this){return result();}
    }
    JSONObject refresh()throws Exception{synchronized(this){if(!loading)lastAttempt=0;}return state();}
    private JSONObject result()throws Exception{
        JSONObject result=saved==null?new JSONObject().put("ok",true).put("weather",JSONObject.NULL).put("aqi",JSONObject.NULL):new JSONObject(saved.toString());
        result.put("city",location==null?"未设置城市":location.getString("name")).put("location",location==null?JSONObject.NULL:new JSONObject(location.toString()))
            .put("location_key",location==null?"":key(location)).put("requires_location",location==null).put("loading",loading)
            .put("weather_error",lastError).put("stale",saved==null||System.currentTimeMillis()-saved.optLong("fetched_at")>FRESH_MS).put("calendar_events",new JSONArray());
        return result;
    }
    private static JSONObject forecast(JSONObject raw,JSONObject loc,long now)throws Exception{
        JSONObject current=raw.getJSONObject("current"),daily=raw.getJSONObject("daily"),hourly=raw.getJSONObject("hourly");
        if(!(current.opt("temperature_2m") instanceof Number)||current.optString("time").length()<16)throw new IOException("Missing current observation");
        JSONObject w=new JSONObject();
        w.put("temp_f",number(current,"temperature_2m")).put("feels_f",number(current,"apparent_temperature")).put("humidity",number(current,"relative_humidity_2m"))
            .put("code",number(current,"weather_code")).put("is_day",number(current,"is_day")).put("wind_mph",number(current,"wind_speed_10m"))
            .put("hi_f",at(daily,"temperature_2m_max",0)).put("lo_f",at(daily,"temperature_2m_min",0)).put("sunrise",at(daily,"sunrise",0)).put("sunset",at(daily,"sunset",0))
            .put("precip_pct",at(daily,"precipitation_probability_max",0));
        JSONArray days=new JSONArray(),hours=new JSONArray(),hours24=new JSONArray();
        JSONArray dates=daily.getJSONArray("time"),times=hourly.getJSONArray("time");
        for(int n=0;n<Math.min(7,dates.length());n++)days.put(new JSONObject().put("date",dates.getString(n)).put("code",at(daily,"weather_code",n))
            .put("hi_f",at(daily,"temperature_2m_max",n)).put("lo_f",at(daily,"temperature_2m_min",n)).put("precip_pct",at(daily,"precipitation_probability_max",n))
            .put("wind_mph",at(daily,"wind_speed_10m_max",n)).put("sunrise",at(daily,"sunrise",n)).put("sunset",at(daily,"sunset",n)));
        String currentHour=current.getString("time").substring(0,13);int currentIndex=-1;
        for(int n=0;n<Math.min(192,times.length());n++){
            String time=times.getString(n);if(time.length()<13)continue;
            JSONObject hour=new JSONObject().put("t",time).put("temp_f",at(hourly,"temperature_2m",n)).put("code",at(hourly,"weather_code",n))
                .put("precip_pct",at(hourly,"precipitation_probability",n)).put("wind_mph",at(hourly,"wind_speed_10m",n)).put("is_day",at(hourly,"is_day",n));
            hours.put(hour);if(time.substring(0,13).compareTo(currentHour)>=0&&hours24.length()<24)hours24.put(hour);if(time.startsWith(currentHour))currentIndex=n;
        }
        w.put("days",days).put("hourly",hours).put("hours24",hours24);
        if(currentIndex>=0){w.put("uv_index",at(hourly,"uv_index",currentIndex));Object visibility=at(hourly,"visibility",currentIndex);w.put("visibility_km",visibility instanceof Number?((Number)visibility).doubleValue()/1000.0:JSONObject.NULL);}
        SimpleDateFormat format=new SimpleDateFormat("yyyy-MM-dd'T'HH:mm",Locale.US);format.setTimeZone(TimeZone.getTimeZone(loc.getString("timezone")));format.setLenient(false);
        return new JSONObject().put("ok",true).put("cache_version",2).put("location_key",key(loc)).put("weather",w).put("weather_at",format.parse(current.getString("time")).getTime()/1000)
            .put("fetched_at",now).put("source","Open-Meteo").put("source_url","https://open-meteo.com/").put("city",loc.getString("name")).put("aqi",JSONObject.NULL);
    }
    private void persist(){FileOutputStream out=null;AtomicFile file=new AtomicFile(cache);try{out=file.startWrite();out.write(saved.toString().getBytes("UTF-8"));file.finishWrite(out);}catch(Exception ignored){if(out!=null)file.failWrite(out);}}
    private static JSONObject get(String url,int timeout)throws Exception{
        HttpURLConnection c=(HttpURLConnection)new URL(url).openConnection();c.setConnectTimeout(timeout);c.setReadTimeout(timeout);c.setInstanceFollowRedirects(false);c.setRequestProperty("Accept-Encoding","identity");c.setRequestProperty("User-Agent","HomeView-Pro8/2 (personal weather display)");
        try{if(c.getResponseCode()!=200)throw new IOException("Weather source unavailable");try(InputStream in=c.getInputStream()){return new JSONObject(new String(NetEaseClient.read(in,256*1024),"UTF-8"));}}finally{c.disconnect();}
    }
    private static Object number(JSONObject o,String key){Object n=o.opt(key);return n instanceof Number?n:JSONObject.NULL;}
    private static Object at(JSONObject o,String key,int n){JSONArray a=o.optJSONArray(key);return a==null?JSONObject.NULL:a.opt(n)==null?JSONObject.NULL:a.opt(n);}
    @Override public synchronized void close(){closed=true;generation++;airWorker.shutdownNow();}
}
