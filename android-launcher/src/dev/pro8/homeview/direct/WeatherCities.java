package dev.pro8.homeview.direct;

import org.json.*;
import java.net.URLEncoder;
import java.util.*;

/** Domestic administrative search; codes travel with the selected city. */
final class WeatherCities {
    interface Fetch { JSONObject get(String url) throws Exception; }
    static JSONArray search(String query,CitySearch rules,Fetch fetch)throws Exception{
        List<CitySearch.Query> plans=rules.plans(query);Exception failure=null;
        for(CitySearch.Query plan:plans)try{
            String[] parts=plan.name.split(", ",2);String province="";
            if(parts.length>1)for(String[] row:provinceRows(rules))if(row[2].equals(parts[1]))province=row[0];
            JSONObject raw=fetch.get("https://uapis.cn/api/v1/misc/district?keywords="+URLEncoder.encode(parts[0],"UTF-8")+"&limit=100"+(plan.country.isEmpty()?"":"&country="+plan.country));
            JSONArray rows=raw.optJSONArray("results");List<JSONObject> cities=new ArrayList<>();Set<String> seen=new HashSet<>();
            if(rows!=null)for(int i=0;i<rows.length();i++)try{
                JSONObject row=rows.getJSONObject(i);String level=row.optString("level"),name=row.optString("name"),admin=rules.admin(row.optString("province"),row.optString("country_code"));
                if(!province.isEmpty()&&!province.equals(admin))continue;
                if(!level.equals("city")&&!level.equals("district")&&!(level.equals("province")&&Arrays.asList("北京市","上海市","天津市","重庆市").contains(name)))continue;
                if(!CitySearch.acceptName(parts[0],name))continue;
                JSONObject center=row.getJSONObject("center");boolean china=row.optString("country_code").equals("CN");
                JSONObject city=LocalWeather.normalize(new JSONObject().put("name",name).put("latitude",center.get("lat")).put("longitude",center.get("lng"))
                    .put("timezone",china?"Asia/Shanghai":row.optString("timezone")).put("country",row.optString("country")).put("admin1",admin).put("admin2",row.optString("city"))
                    .put("feature_code",level.equals("district")?"PPLA3":"PPLA2"));
                if(china&&row.optString("adcode").matches("[0-9]{6}"))city.put("adcode",row.getString("adcode"));
                if(seen.add(city.optString("adcode")+name+center.toString()))cities.add(city);
            }catch(Exception ignored){}
            Collections.sort(cities,(a,b)->Integer.compare(CitySearch.rank(a.optString("feature_code")),CitySearch.rank(b.optString("feature_code"))));
            if(!cities.isEmpty()){JSONArray result=new JSONArray();for(int i=0;i<Math.min(10,cities.size());i++)result.put(cities.get(i));return result;}
        }catch(Exception e){failure=e;}
        if(failure!=null)throw failure;return new JSONArray();
    }
    private static List<String[]> provinceRows(CitySearch rules){return rules.provinceRows();}
}
