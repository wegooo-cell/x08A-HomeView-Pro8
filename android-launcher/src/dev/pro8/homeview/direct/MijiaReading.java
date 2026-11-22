package dev.pro8.homeview.direct;
import org.json.JSONObject;
import java.util.regex.*;
/** Accept actual displayed sensor readings; never substitute zero or outdoor weather. */
final class MijiaReading {
    static JSONObject parse(String kind,String raw)throws Exception{
        Matcher m=Pattern.compile("^\\s*([+-]?[0-9]+(?:\\.[0-9]+)?)\\s*(℃|°[CF]|%|％)\\s*$",Pattern.CASE_INSENSITIVE).matcher(raw);
        if(!m.matches())return null;double value=Double.parseDouble(m.group(1));String unit=m.group(2);
        if(kind.equals("humidity")){if(!(unit.equals("%")||unit.equals("％"))||value<0||value>100)return null;unit="%";}
        else if(kind.equals("temperature")){if(unit.equals("%")||unit.equals("％")||value< -100||value>150)return null;unit=unit.equalsIgnoreCase("°F")?"°F":"°C";}
        else return null;
        return new JSONObject().put("value",m.group(1)).put("unit",unit);
    }
}
