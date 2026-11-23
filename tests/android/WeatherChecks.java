package dev.pro8.homeview.direct;

import android.content.Context;
import org.json.*;
import java.io.*;
import java.text.SimpleDateFormat;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;

/** Runs against the Android framework in a separate, disposable test application. */
public final class WeatherChecks {
    static final JSONArray checks=new JSONArray();
    static void check(boolean value,String name){if(!value)throw new AssertionError(name);checks.put(name);}
    static JSONObject read(Context c,String name)throws Exception{try(InputStream in=c.getAssets().open(name)){ByteArrayOutputStream out=new ByteArrayOutputStream();byte[] b=new byte[4096];int n;while((n=in.read(b))!=-1)out.write(b,0,n);return new JSONObject(out.toString("UTF-8"));}}
    static JSONObject clone(JSONObject o)throws Exception{return new JSONObject(o.toString());}
    static JSONObject await(LocalWeather w)throws Exception{long end=System.currentTimeMillis()+10000;while(System.currentTimeMillis()<end){JSONObject d=w.state();if(!d.optBoolean("loading"))return d;Thread.sleep(20);}throw new AssertionError("Weather worker did not finish");}
    static JSONObject loc()throws Exception{return new JSONObject().put("name","长春市").put("admin1","吉林省").put("admin2","长春市").put("country","中国").put("timezone","Asia/Shanghai").put("latitude",43.816996).put("longitude",125.323643).put("adcode","220100");}
    public static JSONObject run(Context c)throws Exception{
        JSONObject u=read(c,"weather-uapi.json"),v=read(c,"weather-vsaa.json"),loc=loc();
        SimpleDateFormat date=new SimpleDateFormat("yyyy-MM-dd HH:mm",Locale.US);date.setTimeZone(TimeZone.getTimeZone("Asia/Shanghai"));long now=date.parse("2026-01-01 10:00").getTime();
        JSONObject primary=WeatherProviders.uapi(u,loc,now),weather=primary.getJSONObject("weather");
        check(weather.getDouble("temp_f")==0,"zero temperature is preserved");
        check(weather.getInt("code")==71,"snow maps to weather condition");
        check(weather.isNull("wind_mph")&&weather.getString("wind_level").equals("4级"),"wind force is not invented as speed");
        check(weather.getString("sunset").equals("2026-01-01T16:08"),"sunset includes local date");
        check(weather.getJSONArray("hours24").length()==1&&weather.getJSONArray("hours24").getJSONObject(0).getInt("precip_pct")==0,"hourly forecast and zero probability survive");
        check(primary.getJSONObject("aqi").getInt("value")==46&&primary.getJSONObject("aqi").getString("standard").equals("CN"),"air quality uses Chinese standard");
        JSONObject missing=clone(u);missing.remove("aqi");missing.remove("humidity");missing.remove("visibility");
        JSONObject empty=WeatherProviders.uapi(missing,loc,now);check(empty.isNull("aqi")&&empty.getJSONObject("weather").isNull("humidity"),"missing observations remain empty");
        JSONObject foreign=clone(u);foreign.put("province","黑龙江省");boolean rejected=false;try{WeatherProviders.uapi(foreign,loc,now);}catch(Exception expected){rejected=true;}check(rejected,"wrong province rejected");
        foreign=clone(u);foreign.put("adcode","220200");rejected=false;try{WeatherProviders.uapi(foreign,loc,now);}catch(Exception expected){rejected=true;}check(rejected,"wrong district code rejected");
        check(weather.getJSONArray("hours24").getJSONObject(0).getInt("is_day")==1,"hourly icons respect local sunrise and sunset");
        JSONObject fallback=WeatherProviders.fetch(loc,now,(url,timeout)->{if(url.contains("uapis.cn"))throw new java.net.SocketTimeoutException();return clone(v);});
        check(fallback.getString("source").equals("万象数据")&&fallback.getBoolean("fallback"),"timeout automatically selects live backup adapter");
        check(Math.abs(fallback.getJSONObject("weather").getDouble("wind_mph")-13.68)<.001,"backup wind metres per second converts to kilometres per hour");
        check(fallback.getJSONObject("weather").getJSONArray("hours24").length()==0&&fallback.isNull("aqi"),"backup omissions stay empty");
        JSONObject broken=clone(u);broken.put("temperature",JSONObject.NULL);
        check(WeatherProviders.fetch(loc,now,(url,timeout)->url.contains("uapis.cn")?clone(broken):clone(v)).getBoolean("fallback"),"invalid primary response selects backup");
        AtomicInteger calls=new AtomicInteger();AtomicLong clock=new AtomicLong(now);AtomicBoolean offline=new AtomicBoolean(false);
        File directory=new File(c.getFilesDir(),"cache-check");directory.mkdirs();
        LocalWeather.Fetcher fetch=(url,timeout)->{calls.incrementAndGet();if(offline.get())throw new IOException("simulated offline");return clone(u);};
        LocalWeather repo=new LocalWeather(directory,fetch,clock::get);repo.change(loc);
        check(await(repo).getString("source").equals("UAPI"),"default source is UAPI");int firstCalls=calls.get();repo.state();repo.state();check(calls.get()==firstCalls,"fresh cache prevents duplicate network calls");
        repo.refresh();await(repo);check(calls.get()==firstCalls+1,"manual refresh updates fresh weather");repo.close();
        offline.set(true);repo=new LocalWeather(directory,fetch,clock::get);check(repo.state().getJSONObject("weather").getDouble("temp_f")==0&&calls.get()==firstCalls+1,"disk cache survives application restart");
        clock.addAndGet(16*60000);JSONObject stale=await(repo);check(stale.getBoolean("cached")&&stale.getBoolean("stale")&&stale.getJSONObject("weather").getDouble("temp_f")==0,"both sources failing retains stale cache");
        int failures=calls.get();repo.state();repo.state();check(calls.get()==failures,"failure cooldown prevents polling request storm");
        clock.addAndGet(60001);offline.set(false);check(!await(repo).getBoolean("stale"),"weather automatically recovers after cooldown");repo.close();
        CountDownLatch entered=new CountDownLatch(1),release=new CountDownLatch(1);File race=new File(c.getFilesDir(),"race-check");race.mkdirs();
        repo=new LocalWeather(race,(url,timeout)->{if(url.contains("220100")){entered.countDown();release.await(3,TimeUnit.SECONDS);return clone(u);}JSONObject next=clone(u);next.put("province","上海市").put("city","上海市").put("adcode","310000");return next;},()->now);
        repo.change(loc);long start=System.nanoTime();repo.state();check(TimeUnit.NANOSECONDS.toMillis(System.nanoTime()-start)<200,"slow network does not block weather reads");entered.await(3,TimeUnit.SECONDS);
        JSONObject next=clone(loc).put("name","上海市").put("admin1","上海市").put("adcode","310000").put("latitude",31.22222).put("longitude",121.45806);repo.change(next);check(repo.state().isNull("weather"),"switching city cannot show previous city cache");release.countDown();check(await(repo).getString("city").equals("上海市"),"late old-city result cannot overwrite selected city");repo.close();
        CitySearch rules=new CitySearch(c.getAssets().open("frame/hv/weather/provinces.tsv"));JSONObject districts=read(c,"district-uapi.json");
        JSONArray cities=WeatherCities.search("吉林省长春市",rules,url->clone(districts));check(cities.length()==1&&cities.getJSONObject(0).getString("adcode").equals("220100"),"domestic search keeps city code and removes homonym towns");
        // Actual requests run on the Pro8 network, without credentials or proxying the computer.
        long liveStart=System.currentTimeMillis();JSONObject liveRaw=LocalWeather.get(WeatherProviders.uapiUrl(loc),6000);JSONObject live=WeatherProviders.uapi(liveRaw,loc,System.currentTimeMillis());
        check(live.getString("source").equals("UAPI"),"Pro8 directly reaches UAPI");
        JSONObject liveBackup=WeatherProviders.fetch(loc,System.currentTimeMillis(),(url,timeout)->{if(url.contains("uapis.cn"))throw new java.net.SocketTimeoutException("intentional primary outage");return LocalWeather.get(url,timeout);});
        check(liveBackup.getString("source").equals("万象数据"),"Pro8 reaches backup during simulated primary outage");
        return new JSONObject().put("ok",true).put("checks",checks).put("count",checks.length()).put("live_ms",System.currentTimeMillis()-liveStart)
            .put("uapi_temperature",live.getJSONObject("weather").get("temp_f")).put("backup_temperature",liveBackup.getJSONObject("weather").get("temp_f"));
    }
}
