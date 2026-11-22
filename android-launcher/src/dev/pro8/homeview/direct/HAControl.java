package dev.pro8.homeview.direct;

import org.json.JSONArray;
import org.json.JSONObject;

/** Capability-aware service plans. No URLs, credentials or arbitrary actions. */
final class HAControl {
    private static boolean contains(JSONArray list,String value){if(list!=null)for(int i=0;i<list.length();i++)if(value.equals(list.optString(i)))return true;return false;}
    private static boolean brightness(JSONObject a){JSONArray modes=a.optJSONArray("supported_color_modes");if(modes!=null)for(int i=0;i<modes.length();i++)if(!"onoff".equals(modes.optString(i))&&!"unknown".equals(modes.optString(i)))return true;return !a.isNull("brightness")&&a.has("brightness")||(a.optInt("supported_features")&1)!=0;}
    private static double finite(JSONObject b,String key,double min,double max){Object raw=b.opt(key);if(!(raw instanceof Number))throw new IllegalArgumentException("调节数值无效");double n=((Number)raw).doubleValue();if(!Double.isFinite(n)||n<min||n>max)throw new IllegalArgumentException("调节数值超出设备范围");return n;}
    static JSONObject plan(JSONObject entity,JSONObject body,String lastMode)throws Exception{
        String id=entity.optString("entity_id"),state=entity.optString("state"),domain=id.split("\\.")[0],action=body.optString("action"),service=action;
        if(!id.equals(body.optString("entity_id"))||!id.matches("(?:light|switch|climate|fan|input_boolean|humidifier|scene)\\.[a-z0-9_]+"))throw new IllegalArgumentException("请选择有效的家庭设备");
        if(state.equals("unavailable")||state.equals("unknown"))throw new IllegalArgumentException("设备当前离线");
        JSONObject a=entity.optJSONObject("attributes");if(a==null)a=new JSONObject();
        JSONObject data=new JSONObject().put("entity_id",id);
        if((domain.equals("light")||domain.equals("switch"))&&action.equals("toggle")){}
        else if((domain.equals("fan")||domain.equals("input_boolean")||domain.equals("humidifier"))&&action.equals("toggle")){service=state.equals("off")?"turn_on":"turn_off";}
        else if(domain.equals("scene")&&action.equals("turn_on")){}
        else if(domain.equals("light")&&action.equals("set_brightness")){
            if(!brightness(a))throw new IllegalArgumentException("这盏灯不支持亮度调节");
            data.put("brightness_pct",finite(body,"brightness",0,100));service="turn_on";
        }else if(domain.equals("light")&&action.equals("set_color_temp")){
            if(!contains(a.optJSONArray("supported_color_modes"),"color_temp")&&!a.has("min_color_temp_kelvin")&&!a.has("min_mireds"))throw new IllegalArgumentException("这盏灯不支持色温调节");
            double min=a.optDouble("min_color_temp_kelvin",a.optDouble("max_mireds",0)>0?1000000/a.optDouble("max_mireds"):2000),max=a.optDouble("max_color_temp_kelvin",a.optDouble("min_mireds",0)>0?1000000/a.optDouble("min_mireds"):6500);
            double n=finite(body,"kelvin",Math.max(1000,min),Math.min(15000,max));if(n!=Math.rint(n))throw new IllegalArgumentException("色温数值无效");
            data.put("color_temp_kelvin",(int)n);service="turn_on";
        }else if(domain.equals("light")&&action.equals("set_rgb")){
            if(!contains(a.optJSONArray("supported_color_modes"),"rgb"))throw new IllegalArgumentException("这盏灯不支持 RGB 调节");
            JSONArray values=body.optJSONArray("rgb");
            if(values==null||values.length()!=3)throw new IllegalArgumentException("需要三个 RGB 数值");
            JSONArray rgb=new JSONArray();
            for(int i=0;i<3;i++){
                Object raw=values.opt(i);
                if(!(raw instanceof Number))throw new IllegalArgumentException("RGB 数值无效");
                double channel=((Number)raw).doubleValue();
                if(channel<0||channel>255||channel!=Math.rint(channel))throw new IllegalArgumentException("RGB 数值无效");
                rgb.put((int)channel);
            }
            data.put("rgb_color",rgb);service="turn_on";
        }else if(domain.equals("climate")&&action.equals("set_temperature")){
            data.put("temperature",finite(body,"temperature",a.optDouble("min_temp",-20),a.optDouble("max_temp",60)));
        }else if(domain.equals("climate")&&action.equals("set_hvac_mode")){
            String mode=body.optString("hvac_mode");if(!contains(a.optJSONArray("hvac_modes"),mode))throw new IllegalArgumentException("空调不支持这个模式");data.put("hvac_mode",mode);
        }else if(domain.equals("climate")&&action.equals("toggle")){
            JSONArray modes=a.optJSONArray("hvac_modes");String next=null;
            if(!state.equals("off")&&contains(modes,"off"))next="off";
            else if(state.equals("off")&&modes!=null){if(lastMode!=null&&!lastMode.equals("off")&&contains(modes,lastMode))next=lastMode;else if(contains(modes,"cool"))next="cool";else for(int i=0;i<modes.length();i++)if(!modes.optString(i).equals("off")){next=modes.optString(i);break;}}
            if(next!=null){service="set_hvac_mode";data.put("hvac_mode",next);}else service=state.equals("off")?"turn_on":"turn_off";
        }else throw new IllegalArgumentException("设备不支持这项调节");
        return new JSONObject().put("domain",domain).put("service",service).put("data",data);
    }
}
