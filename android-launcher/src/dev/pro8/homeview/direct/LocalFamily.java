package dev.pro8.homeview.direct;
import android.content.Context;
import android.content.SharedPreferences;
import org.json.*;
/** Provider choice and independent settings; switching never edits either account. */
final class LocalFamily {
    private final HomeAssistantClient ha;private final LocalMijia mijia;private final SharedPreferences prefs;
    LocalFamily(Context c,HomeAssistantClient ha){this.ha=ha;mijia=new LocalMijia(c);prefs=c.getSharedPreferences("homeview_family",0);}
    private String provider(){return prefs.getString("provider","");}
    synchronized JSONObject status()throws Exception{
        String mode=provider();JSONObject s;
        if(mode.equals("ha"))s=ha.status();
        else if(mode.equals("mijia")){
            s=new JSONObject().put("ok",true).put("configured",mijia.available()).put("authorized",false).put("home_name",ha.status().optString("home_name"));
            try{mijia.entities();s.put("authorized",true).put("pins",mijia.pins());}catch(Exception e){s.put("error",e.getMessage());}
        }else s=new JSONObject().put("ok",true).put("configured",false).put("authorized",false).put("home_name",ha.status().optString("home_name"));
        return s.put("provider",mode).put("selection_required",mode.isEmpty()).put("mijia_available",mijia.available());
    }
    synchronized JSONObject select(JSONObject data)throws Exception{
        String mode=data.optString("provider");if(!mode.equals("ha")&&!mode.equals("mijia"))throw new IllegalArgumentException("请选择米家或 Home Assistant");
        if(mode.equals("mijia")&&!mijia.available())throw new IllegalArgumentException("这台设备的内置米家暂不可用");
        if(!prefs.edit().putString("provider",mode).commit())throw new java.io.IOException("选择保存失败，请重试");return new JSONObject().put("ok",true).put("provider",mode);
    }
    synchronized JSONObject entities()throws Exception{
        String mode=provider();if(mode.equals("ha"))return ha.entities().put("provider",mode);
        if(mode.equals("mijia"))return new JSONObject().put("ok",true).put("provider",mode).put("items",mijia.entities()).put("pins",mijia.pins());
        return new JSONObject().put("ok",true).put("provider","").put("items",new JSONArray()).put("pins",new JSONObject());
    }
    synchronized JSONObject pins(JSONObject data)throws Exception{check(data);return provider().equals("mijia")?mijia.savePins(data):ha.pins(data);}
    synchronized JSONObject control(JSONObject data)throws Exception{check(data);return provider().equals("mijia")?mijia.control(data):ha.control(data);}
    private void check(JSONObject data){if(provider().isEmpty()||!provider().equals(data.optString("provider")))throw new IllegalArgumentException("家庭来源已更改，请刷新后重试");}
    void close(){mijia.close();}
}
