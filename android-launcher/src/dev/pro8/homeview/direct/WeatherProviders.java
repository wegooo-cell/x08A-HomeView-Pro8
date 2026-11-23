package dev.pro8.homeview.direct;

import org.json.*;
import java.io.IOException;
import java.net.URLEncoder;
import java.text.SimpleDateFormat;
import java.util.*;

/** Provider adapters keep units, missing fields and location identity explicit. */
final class WeatherProviders {
    interface Fetch { JSONObject get(String url,int timeout)throws Exception; }
    static JSONObject fetch(JSONObject loc,long now,Fetch fetch)throws Exception{
        try{return uapi(fetch.get(uapiUrl(loc),6000),loc,now);}
        catch(Exception first){return vsaa(fetch.get(backupUrl(loc),6000),loc,now);}
    }
    static String uapiUrl(JSONObject loc)throws Exception{
        String code=loc.optString("adcode"),query=code.matches("[0-9]{6}")?"adcode="+code:"city="+encode(qualified(loc));
        return "https://uapis.cn/api/v1/misc/weather?"+query+"&extended=true&forecast=true&hourly=true";
    }
    static String backupUrl(JSONObject loc)throws Exception{
        return "https://api.vsaa.cn/api/weather/index.php?city="+encode(loc.getString("name").replaceFirst("市$",""))+"&days=7&type=zytq";
    }
    private static String encode(String value)throws Exception{return URLEncoder.encode(value,"UTF-8");}
    private static String qualified(JSONObject loc){String province=loc.optString("admin1"),name=loc.optString("name");return name.startsWith(province)?name:province+name;}
    private static String shortName(String s){return s.trim().replaceFirst("(?:维吾尔自治区|壮族自治区|回族自治区|自治区|特别行政区|[市省])$","");}
    private static void verify(JSONObject loc,String province,String city,String code)throws Exception{
        String expected=loc.optString("adcode"),admin=loc.optString("admin1");
        if(!admin.isEmpty()&&!shortName(admin).equals(shortName(province)))throw new IOException("Weather province mismatch");
        if(!expected.isEmpty()&&!code.isEmpty()){
            if(!expected.equals(code))throw new IOException("Weather district mismatch");return;
        }
        if(!shortName(loc.optString("name")).equalsIgnoreCase(shortName(city)))throw new IOException("Weather city mismatch");
    }
    static JSONObject uapi(JSONObject raw,JSONObject loc,long now)throws Exception{
        verify(loc,raw.optString("province"),raw.optString("district").isEmpty()?raw.optString("city"):raw.optString("district"),raw.optString("adcode"));
        requireTemperature(raw,"temperature");
        JSONArray days=new JSONArray(),hours=new JSONArray(),sourceDays=raw.optJSONArray("forecast"),sourceHours=raw.optJSONArray("hourly_forecast");
        if(sourceDays!=null)for(int i=0;i<Math.min(10,sourceDays.length());i++){
            JSONObject d=sourceDays.optJSONObject(i);if(d==null||!date(d.optString("date")))continue;
            String date=d.getString("date");days.put(new JSONObject().put("date",date).put("code",condition(d.optString("weather_day"))).put("hi_f",num(d,"temp_max")).put("lo_f",num(d,"temp_min"))
                .put("precip_pct",percentage(d,"precipitation_probability","pop")).put("wind_mph",num(d,"wind_speed"))
                .put("sunrise",solar(date,d.optString("sunrise"))).put("sunset",solar(date,d.optString("sunset"))));
        }
        if(sourceHours!=null)for(int i=0;i<Math.min(240,sourceHours.length());i++){
            JSONObject h=sourceHours.optJSONObject(i);if(h==null)continue;String t=h.optString("time").replace(' ','T');if(!t.matches("[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}(:[0-9]{2})?"))continue;
            hours.put(new JSONObject().put("t",t).put("temp_f",num(h,"temperature")).put("code",condition(h.optString("weather"))).put("precip_pct",percentage(h,"precipitation_probability","pop"))
                .put("wind_mph",num(h,"wind_speed")).put("is_day",daylight(days,t)));
        }
        JSONObject today=today(days,loc,now),weather=new JSONObject().put("temp_f",num(raw,"temperature")).put("feels_f",num(raw,"feels_like")).put("humidity",bounded(raw,"humidity",0,100))
            .put("code",condition(raw.optString("weather"))).put("wind_mph",num(raw,"wind_speed")).put("wind_level",raw.optString("wind_power"))
            .put("hi_f",raw.has("temp_max")?num(raw,"temp_max"):today.opt("hi_f")).put("lo_f",raw.has("temp_min")?num(raw,"temp_min"):today.opt("lo_f"))
            .put("sunrise",today.opt("sunrise")).put("sunset",today.opt("sunset")).put("precip_pct",percentage(raw,"precipitation_probability","pop"))
            .put("uv_index",num(raw,"uv")).put("visibility_km",num(raw,"visibility")).put("days",days).put("hourly",hours).put("hours24",future(hours,loc,now));
        JSONObject result=envelope(weather,loc,now,"UAPI","https://uapis.cn/docs/api-reference/get-misc-weather",raw.optString("report_time"));
        result.put("aqi",aqi(raw,"aqi"));return result;
    }
    static JSONObject vsaa(JSONObject raw,JSONObject loc,long now)throws Exception{
        if(!raw.optBoolean("success")||raw.optInt("code")!=200)throw new IOException("Backup weather unavailable");
        JSONObject location=raw.getJSONObject("location"),current=raw.getJSONObject("current");
        verify(loc,location.optString("province"),location.optString("name",raw.optString("city")),"");requireTemperature(current,"temperature");
        JSONArray days=new JSONArray(),rows=raw.optJSONArray("forecast");
        if(rows!=null)for(int i=0;i<Math.min(10,rows.length());i++){
            JSONObject d=rows.optJSONObject(i);if(d==null||!date(d.optString("date")))continue;
            days.put(new JSONObject().put("date",d.getString("date")).put("code",condition(d.optString("day_weather"))).put("hi_f",num(d,"max_temp")).put("lo_f",num(d,"min_temp"))
                .put("precip_pct",JSONObject.NULL).put("wind_mph",JSONObject.NULL).put("sunrise",JSONObject.NULL).put("sunset",JSONObject.NULL));
        }
        JSONObject today=today(days,loc,now);Object speed=num(current,"wind_speed");
        JSONObject w=new JSONObject().put("temp_f",num(current,"temperature")).put("feels_f",num(current,"feels_like")).put("humidity",bounded(current,"humidity",0,100))
            .put("code",condition(current.optString("weather"))).put("wind_mph",speed instanceof Number?((Number)speed).doubleValue()*3.6:JSONObject.NULL).put("wind_level",current.optString("wind_level"))
            .put("hi_f",today.opt("hi_f")).put("lo_f",today.opt("lo_f")).put("days",days).put("hourly",new JSONArray()).put("hours24",new JSONArray());
        return envelope(w,loc,now,"万象数据","https://api.vsaa.cn/detail/16",current.optString("updated_at")).put("fallback",true);
    }
    private static JSONObject envelope(JSONObject weather,JSONObject loc,long now,String source,String url,String report)throws Exception{
        weather.put("is_day",JSONObject.NULL);
        Object time=observationTime(report,loc);
        if(time instanceof Number&&(now-((Number)time).longValue()*1000>6*3600000L||((Number)time).longValue()*1000-now>600000))throw new IOException("Weather observation is out of date");
        return new JSONObject().put("ok",true).put("cache_version",3).put("location_key",LocalWeather.key(loc)).put("weather",weather).put("weather_at",time).put("fetched_at",now)
            .put("source",source).put("source_url",url).put("city",loc.getString("name")).put("aqi",JSONObject.NULL).put("fallback",false);
    }
    private static Object observationTime(String s,JSONObject loc){
        if(s==null||!s.matches("[0-9]{4}-[0-9]{2}-[0-9]{2}[ T][0-9]{2}:[0-9]{2}(:[0-9]{2})?"))return JSONObject.NULL;
        try{SimpleDateFormat f=new SimpleDateFormat(s.length()==19?"yyyy-MM-dd'T'HH:mm:ss":"yyyy-MM-dd'T'HH:mm",Locale.US);f.setLenient(false);f.setTimeZone(TimeZone.getTimeZone(loc.optString("timezone")));return f.parse(s.replace(' ','T')).getTime()/1000;}catch(Exception e){return JSONObject.NULL;}
    }
    private static String local(JSONObject loc,long now,String pattern){SimpleDateFormat f=new SimpleDateFormat(pattern,Locale.US);f.setTimeZone(TimeZone.getTimeZone(loc.optString("timezone")));return f.format(new Date(now));}
    private static JSONObject today(JSONArray days,JSONObject loc,long now){String date=local(loc,now,"yyyy-MM-dd");for(int i=0;i<days.length();i++)if(date.equals(days.optJSONObject(i).optString("date")))return days.optJSONObject(i);return new JSONObject();}
    private static JSONArray future(JSONArray hours,JSONObject loc,long now){JSONArray out=new JSONArray();String current=local(loc,now,"yyyy-MM-dd'T'HH");for(int i=0;i<hours.length()&&out.length()<24;i++)if(hours.optJSONObject(i).optString("t").substring(0,13).compareTo(current)>=0)out.put(hours.optJSONObject(i));return out;}
    private static boolean date(String s){return s.matches("[0-9]{4}-[0-9]{2}-[0-9]{2}");}
    private static Object daylight(JSONArray days,String time){
        for(int i=0;i<days.length();i++){JSONObject day=days.optJSONObject(i);if(!time.startsWith(day.optString("date")))continue;String rise=day.optString("sunrise"),set=day.optString("sunset");
            if(rise.length()>=16&&set.length()>=16){String clock=time.substring(11,16);return clock.compareTo(rise.substring(11,16))>=0&&clock.compareTo(set.substring(11,16))<0?1:0;}}
        return JSONObject.NULL;
    }
    private static Object solar(String date,String s){return s.matches("[0-9]{2}:[0-9]{2}")?date+"T"+s:JSONObject.NULL;}
    static Object num(JSONObject o,String key){Object n=o.opt(key);if(n==null||n==JSONObject.NULL||n instanceof Boolean)return JSONObject.NULL;try{double d=n instanceof Number?((Number)n).doubleValue():Double.parseDouble(n.toString());return Double.isFinite(d)?d:JSONObject.NULL;}catch(Exception e){return JSONObject.NULL;}}
    private static Object bounded(JSONObject o,String key,double min,double max){Object n=num(o,key);return n instanceof Number&&((Number)n).doubleValue()>=min&&((Number)n).doubleValue()<=max?n:JSONObject.NULL;}
    private static Object percentage(JSONObject o,String a,String b){return o.has(a)?bounded(o,a,0,100):bounded(o,b,0,100);}
    private static void requireTemperature(JSONObject o,String key)throws Exception{if(!(bounded(o,key,-100,70) instanceof Number))throw new IOException("Missing weather temperature");}
    private static Object aqi(JSONObject o,String key)throws Exception{Object n=bounded(o,key,0,500);if(!(n instanceof Number))return JSONObject.NULL;int v=((Number)n).intValue();String category=v<=50?"优":v<=100?"良":v<=150?"轻度污染":v<=200?"中度污染":v<=300?"重度污染":"严重污染";return new JSONObject().put("value",v).put("standard","CN").put("category",category);}
    static Object condition(String s){
        if(s==null||s.equals("null"))return JSONObject.NULL;
        if(s.contains("雷"))return 95;if(s.contains("冻雨"))return 66;if(s.contains("雨夹雪"))return 68;
        if(s.contains("雪"))return s.contains("大")||s.contains("暴")?75:s.contains("中")?73:71;
        if(s.contains("雨"))return s.contains("暴")?82:s.contains("大")?65:s.contains("中")?63:61;
        if(s.contains("雾"))return 45;if(s.contains("霾"))return 48;if(s.contains("阴"))return 3;if(s.contains("多云"))return 2;if(s.contains("少云"))return 1;if(s.contains("晴"))return 0;return JSONObject.NULL;
    }
}
