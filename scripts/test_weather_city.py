"""Run the actual LocalWeather with host Android adapters and a controlled transport.
No user accounts, device files or real weather requests are used here.
"""
import os,subprocess,tempfile,shutil
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
STUBS={
'android/content/Context.java': 'package android.content;import java.io.File;public class Context{public File getFilesDir(){return null;}}',
'android/util/Log.java': 'package android.util;public class Log{public static int w(String a,String b){return 0;}}',
'android/util/AtomicFile.java': '''package android.util;import java.io.*;public class AtomicFile{final File f,n;public AtomicFile(File f){this.f=f;n=new File(f+".new");}public FileInputStream openRead()throws IOException{return new FileInputStream(f);}public FileOutputStream startWrite()throws IOException{return new FileOutputStream(n);}public void finishWrite(FileOutputStream o)throws IOException{o.close();if(!n.renameTo(f))throw new IOException();}public void failWrite(FileOutputStream o){try{o.close();}catch(Exception e){}n.delete();}public void delete(){f.delete();n.delete();new File(f+".bak").delete();}}''',
'dev/pro8/homeview/direct/NetEaseClient.java': '''package dev.pro8.homeview.direct;import java.io.*;class NetEaseClient{static byte[] read(InputStream in,int max)throws IOException{ByteArrayOutputStream out=new ByteArrayOutputStream();byte[] b=new byte[4096];int n;while((n=in.read(b))!=-1){if(out.size()+n>max)throw new IOException();out.write(b,0,n);}return out.toByteArray();}}'''
}
HARNESS=r'''package dev.pro8.homeview.direct;
import org.json.*;import java.io.*;import java.nio.file.*;import java.util.*;import java.util.concurrent.*;import java.util.concurrent.atomic.*;
public class WeatherHarness{
 static int checks=0;static final List<LocalWeather> opened=new ArrayList<>();
 static void check(boolean ok,String name){checks++;if(!ok)throw new AssertionError(name);}
 static JSONObject loc(String name,double lat,double lon,String zone)throws Exception{return new JSONObject().put("name",name).put("latitude",lat).put("longitude",lon).put("timezone",zone).put("country","测试国家").put("admin1","测试地区");}
 static JSONObject sh()throws Exception{return loc("上海",31.2304,121.4737,"Asia/Shanghai");}
 static JSONObject tokyo()throws Exception{return loc("东京",35.6762,139.6503,"Asia/Tokyo");}
 static void write(File file,JSONObject value)throws Exception{Files.write(file.toPath(),value.toString().getBytes("UTF-8"));}
 static JSONObject read(File file)throws Exception{return new JSONObject(new String(Files.readAllBytes(file.toPath()),"UTF-8"));}
 static JSONObject raw(double temp)throws Exception{
  JSONObject c=new JSONObject().put("time","2026-10-23T08:00").put("temperature_2m",temp).put("apparent_temperature",temp-1).put("relative_humidity_2m",60).put("weather_code",1).put("is_day",1).put("wind_speed_10m",10);
  JSONObject d=new JSONObject().put("time",new JSONArray().put("2026-10-23"));for(String k:new String[]{"weather_code","temperature_2m_max","temperature_2m_min","precipitation_probability_max","wind_speed_10m_max"})d.put(k,new JSONArray().put(20));d.put("sunrise",new JSONArray().put("2026-10-23T06:00")).put("sunset",new JSONArray().put("2026-10-23T18:00"));
  JSONObject h=new JSONObject().put("time",new JSONArray().put("2026-10-23T08:00").put("2026-10-23T09:00"));for(String k:new String[]{"temperature_2m","weather_code","precipitation_probability","wind_speed_10m","is_day","uv_index","visibility"})h.put(k,new JSONArray().put(1).put(2));
  return new JSONObject().put("current",c).put("daily",d).put("hourly",h);
 }
 static class Mock implements LocalWeather.Fetcher{
  final List<String> urls=Collections.synchronizedList(new ArrayList<>());volatile boolean offline,timeout;volatile int forecastBudget;volatile CountDownLatch forecastStart,forecastRelease,airStart,airRelease;
  public JSONObject get(String url,int timeout)throws Exception{
   urls.add(url);if(this.timeout)throw new java.net.SocketTimeoutException("fixture");if(offline)throw new IOException("offline");
   boolean a=url.contains("latitude=31.2304");
   if(url.contains("air-quality")){
    if(a&&airStart!=null){airStart.countDown();airRelease.await(4,TimeUnit.SECONDS);}
    return new JSONObject().put("current",new JSONObject().put("us_aqi",a?400:33));
   }
   if(url.contains("geocoding"))return new JSONObject().put("results",new JSONArray().put(sh()).put(tokyo()).put(new JSONObject().put("name","bad")));
   if(a&&forecastStart!=null){forecastStart.countDown();forecastRelease.await(4,TimeUnit.SECONDS);}
   forecastBudget=timeout;return raw(a?23:17);
  }
 }
 static LocalWeather make(File root,String name,Mock m){File dir=new File(root,name);dir.mkdirs();LocalWeather w=new LocalWeather(dir,m);opened.add(w);return w;}
 static void air(LocalWeather w,int expected)throws Exception{for(int i=0;i<100;i++){JSONObject a=w.state().optJSONObject("aqi");if(a!=null&&a.optInt("us_aqi")==expected)return;Thread.sleep(10);}throw new AssertionError("AQI did not settle");}
 public static void main(String[] args)throws Exception{File root=new File(args[0]);try{
  File legacyDir=new File(root,"legacy");legacyDir.mkdirs();write(new File(legacyDir,"weather-beijing.json"),new JSONObject().put("city","北京").put("weather",new JSONObject().put("temp_f",99)));
  Mock m=new Mock();LocalWeather w=make(root,"legacy",m);JSONObject empty=w.state();check(empty.isNull("weather")&&empty.isNull("aqi"),"legacy weather absent");check(empty.getBoolean("requires_location"),"requires explicit selection");check(!new File(legacyDir,"weather-beijing.json").exists(),"legacy disk deleted");check(m.urls.isEmpty(),"no Beijing request on upgrade");
  w.change(sh());JSONObject first=w.state();check(first.getString("city").equals("上海"),"display matches city");check(first.getJSONObject("weather").getDouble("temp_f")==23,"forecast data");check(first.getLong("weather_at")==1792713600L,"observation parsed in city time zone");air(w,400);
  check(m.urls.stream().anyMatch(u->u.contains("forecast?")&&u.contains("latitude=31.2304&longitude=121.4737&timezone=Asia%2FShanghai")),"forecast location");check(m.urls.stream().anyMatch(u->u.contains("air-quality?")&&u.contains("latitude=31.2304&longitude=121.4737&timezone=Asia%2FShanghai")),"AQI same location");
  int count=m.urls.size();w.state();check(m.urls.size()==count,"fresh cache reused");m.offline=true;LocalWeather again=make(root,"legacy",m);check(again.state().getString("city").equals("上海"),"location survives restart");check(again.state().getJSONObject("weather").getDouble("temp_f")==23,"matching cache survives restart");
  again.change(tokyo());check(!new File(legacyDir,"weather-cache-v2.json").exists(),"old city cache removed on selection");JSONObject offline=again.state();check(offline.getString("city").equals("东京")&&offline.isNull("weather")&&offline.isNull("aqi"),"offline new city cannot show old data");check(offline.getBoolean("stale"),"empty cache stale");
  JSONObject returned=again.settings();returned.getJSONObject("location").put("name","changed by caller");check(again.settings().getJSONObject("location").getString("name").equals("东京"),"defensive settings copy");
  for(JSONObject bad:new JSONObject[]{loc("bad",91,1,"UTC"),loc("bad",1,181,"UTC"),loc("bad",1,1,"Bogus/Zone"),loc("bad\nname",1,1,"UTC"),loc("",1,1,"UTC"),new JSONObject().put("name","no coordinates")}){boolean rejected=false;try{again.change(bad);}catch(Exception e){rejected=true;}check(rejected,"invalid selection rejected");check(again.settings().getJSONObject("location").getString("name").equals("东京"),"invalid selection preserves location");}
  Mock race=new Mock();race.forecastStart=new CountDownLatch(1);race.forecastRelease=new CountDownLatch(1);LocalWeather r=make(root,"race",race);r.change(sh());AtomicReference<JSONObject> delayed=new AtomicReference<>();Thread t=new Thread(()->{try{delayed.set(r.state());}catch(Exception e){throw new RuntimeException(e);}});t.start();check(race.forecastStart.await(2,TimeUnit.SECONDS),"old forecast in flight");long start=System.nanoTime();r.change(tokyo());check((System.nanoTime()-start)/1000000<500,"setting not blocked by network");r.state();air(r,33);race.forecastRelease.countDown();t.join(3000);check(!t.isAlive()&&delayed.get()!=null,"old request completes");check(delayed.get().getString("city").equals("东京")&&delayed.get().getJSONObject("weather").getDouble("temp_f")==17,"old forecast cannot return or overwrite old city");check(read(new File(root,"race/weather-cache-v2.json")).getString("city").equals("东京"),"old forecast cannot persist");
  Mock aq=new Mock();aq.airStart=new CountDownLatch(1);aq.airRelease=new CountDownLatch(1);LocalWeather q=make(root,"air-race",aq);q.change(sh());q.state();check(aq.airStart.await(2,TimeUnit.SECONDS),"old AQI in flight");q.change(tokyo());q.state();check(q.state().isNull("aqi"),"old AQI cleared while pending");aq.airRelease.countDown();air(q,33);check(q.state().getJSONObject("aqi").getInt("us_aqi")==33,"old AQI cannot overwrite new city");
  Mock search=new Mock();LocalWeather s=make(root,"search",search);JSONArray found=s.search("上海 &x=1").getJSONArray("results");check(found.length()==2,"invalid geocoding results dropped");check(found.getJSONObject(0).getString("admin1").equals("测试地区"),"disambiguation metadata");check(search.urls.get(0).contains("%26x%3D1")&&!search.urls.get(0).contains("&x=1"),"search URL escaped");
  for(String bad:new String[]{"北","",new String(new char[81]).replace('\0','a'),"xx\n"}){boolean rejected=false;try{s.search(bad);}catch(Exception e){rejected=true;}if(bad.equals("xx\n"))check(!rejected,"trailing whitespace normalized");else check(rejected,"bad search rejected");}
  File staleFile=new File(root,"race/weather-cache-v2.json");JSONObject stale=read(staleFile);stale.put("fetched_at",0);write(staleFile,stale);Mock broken=new Mock();broken.offline=true;LocalWeather old=make(root,"race",broken);JSONObject fallback=old.state();check(fallback.getBoolean("stale")&&fallback.getLong("fetched_at")==0,"offline data retains original timestamp");check(fallback.getString("city").equals("东京"),"stale cache still same city");
  stale.put("location_key","wrong city");write(staleFile,stale);LocalWeather mismatch=make(root,"race",broken);check(mismatch.state().isNull("weather"),"wrong location cache rejected");check(!staleFile.exists(),"wrong location disk cache removed");
  Mock retry=new Mock();retry.timeout=true;LocalWeather recovery=make(root,"retry",retry);recovery.change(sh());JSONObject timed=recovery.state();check(timed.isNull("weather")&&timed.getString("weather_error").contains("超时"),"service timeout has an accurate public message");int attempts=retry.urls.size();retry.timeout=false;recovery.state();check(retry.urls.size()==attempts,"automatic retry observes cooldown");JSONObject recovered=recovery.refresh();check(recovered.getJSONObject("weather").getDouble("temp_f")==23,"explicit refresh bypasses failure cooldown");check(retry.forecastBudget==12000,"forecast allows twelve second network operations");check(recovered.getString("weather_error").isEmpty(),"success clears previous error");
  System.out.println("PASS "+checks+" actual LocalWeather checks");
 }finally{for(LocalWeather w:opened)w.close();}}
}'''

def main():
    jdk=Path(os.environ['JAVA_HOME'])/'bin';jar=Path(os.environ['JSON_JAR'])
    with tempfile.TemporaryDirectory(prefix='homeview-weather-') as tmp:
        work=Path(tmp);src=work/'src';classes=work/'classes';classes.mkdir()
        for name,text in STUBS.items():
            p=src/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(text)
        package=src/'dev/pro8/homeview/direct'
        (package/'WeatherHarness.java').write_text(HARNESS)
        shutil.copyfile(ROOT/'android-launcher/src/dev/pro8/homeview/direct/LocalWeather.java',package/'LocalWeather.java')
        subprocess.run([str(jdk/'javac'),'--release','8','-cp',str(jar),'-d',str(classes),*[str(p) for p in src.rglob('*.java')]],check=True)
        subprocess.run([str(jdk/'java'),'-cp',str(classes)+os.pathsep+str(jar),'dev.pro8.homeview.direct.WeatherHarness',str(work/'state')],check=True)
if __name__=='__main__':main()
