package dev.pro8.homeview.direct;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.time.*;
import java.time.format.*;
import java.util.*;

/** Conservative iCalendar VEVENT reader/editor. Unknown lines/components survive edits. */
final class ICalendar {
    static final ZoneId DISPLAY=ZoneId.of("Asia/Shanghai");
    static final DateTimeFormatter DAY=DateTimeFormatter.BASIC_ISO_DATE;
    static final DateTimeFormatter STAMP=DateTimeFormatter.ofPattern("uuuuMMdd'T'HHmmss");
    static final class Event {
        String uid,title="",location="",notes="",reason="",recurrence="";
        LocalDate date,endDate;String time="00:00",endTime="00:00";
        Instant start,end;boolean allDay,readonly;
    }
    static final class Change {
        String title,location,notes,date,time,endDate,endTime;boolean allDay;
    }
    static final class Property {
        final String line,name,head,value;final Map<String,String> params=new LinkedHashMap<>();
        Property(String line)throws IOException{
            this.line=line;int colon=delimiter(line,':');if(colon<1)throw new IOException("日程属性无效");head=line.substring(0,colon);value=line.substring(colon+1);List<String> parts=split(head,';');name=parts.get(0).toUpperCase(Locale.ROOT);
            for(int i=1;i<parts.size();i++){String p=parts.get(i);int eq=p.indexOf('=');if(eq>0){String v=p.substring(eq+1);if(v.startsWith("\"")&&v.endsWith("\""))v=v.substring(1,v.length()-1);params.put(p.substring(0,eq).toUpperCase(Locale.ROOT),v);}}
        }
    }
    static List<String> lines(String data)throws IOException{
        if(data.length()>512*1024||data.indexOf('\0')>=0)throw new IOException("单份日程超出读取上限");String[] raw=data.replace("\r\n","\n").replace('\r','\n').split("\n",-1);List<String> out=new ArrayList<>();
        for(String line:raw){if(line.startsWith(" ")||line.startsWith("\t")){if(out.isEmpty())throw new IOException("日程折行无效");int last=out.size()-1;out.set(last,out.get(last)+line.substring(1));}else if(!line.isEmpty())out.add(line);}
        if(out.size()<3||!out.get(0).equalsIgnoreCase("BEGIN:VCALENDAR")||!out.get(out.size()-1).equalsIgnoreCase("END:VCALENDAR"))throw new IOException("日历格式无效");return out;
    }
    static List<Event> read(String data)throws IOException{
        List<String> lines=lines(data);List<Event> result=new ArrayList<>();List<Property> props=null;int depth=0;
        for(String line:lines){Property p=new Property(line);if(p.name.equals("BEGIN")){if(p.value.equalsIgnoreCase("VEVENT")){if(props!=null)throw new IOException("日程层级无效");props=new ArrayList<>();depth=1;}else if(props!=null)depth++;continue;}if(p.name.equals("END")){if(props!=null){if(--depth==0){result.add(event(props));props=null;}}continue;}if(props!=null&&depth==1)props.add(p);}
        if(props!=null)throw new IOException("日程数据不完整");return result;
    }
    static Event event(List<Property> props)throws IOException{
        Map<String,Property> p=new LinkedHashMap<>();Event e=new Event();
        for(Property a:props){if(p.containsKey(a.name)&&Arrays.asList("UID","DTSTART","DTEND","DURATION").contains(a.name))e.reason="特殊日程属性，仅支持查看";p.put(a.name,a);}
        if(!p.containsKey("UID")||!p.containsKey("DTSTART"))throw new IOException("日程缺少UID或时间");e.uid=p.get("UID").value;e.title=text(value(p,"SUMMARY"));e.location=text(value(p,"LOCATION"));e.notes=text(value(p,"DESCRIPTION"));e.recurrence=value(p,"RECURRENCE-ID");
        for(String k:new String[]{"RRULE","RDATE","EXDATE","EXRULE","RECURRENCE-ID"})if(p.containsKey(k))e.reason="重复日程请在苹果日历中修改";
        if(p.containsKey("DTEND")&&p.containsKey("DURATION"))e.reason="特殊日程时长，仅支持查看";
        if(p.containsKey("ATTENDEE")||p.containsKey("ORGANIZER"))e.reason="邀请日程请在苹果日历中修改";
        if("CANCELLED".equalsIgnoreCase(value(p,"STATUS")))e.reason="已取消的日程，仅支持查看";
        Property start=p.get("DTSTART"),end=p.get("DTEND");e.allDay="DATE".equalsIgnoreCase(start.params.get("VALUE"))||start.value.matches("[0-9]{8}");
        try{
            if(e.allDay){e.date=LocalDate.parse(start.value,DAY);LocalDate exclusive=end==null?e.date.plusDays(1):LocalDate.parse(end.value,DAY);if(p.containsKey("DURATION")){exclusive=e.date.plusDays(durationDays(p.get("DURATION").value));}if(!exclusive.isAfter(e.date))throw new IOException("全天日程结束日期无效");e.endDate=exclusive.minusDays(1);e.start=e.date.atStartOfDay(DISPLAY).toInstant();e.end=exclusive.atStartOfDay(DISPLAY).toInstant();}
            else{e.start=instant(start);e.end=end!=null?instant(end):p.containsKey("DURATION")?e.start.plus(Duration.parse(p.get("DURATION").value)):e.start;if(e.end.isBefore(e.start))throw new IOException("日程结束时间无效");ZonedDateTime a=e.start.atZone(DISPLAY),b=e.end.atZone(DISPLAY);e.date=a.toLocalDate();e.endDate=b.toLocalDate();e.time=a.toLocalTime().toString().substring(0,5);e.endTime=b.toLocalTime().toString().substring(0,5);}
        }catch(DateTimeException ex){throw new IOException("日程日期或时区暂不支持");}
        e.readonly=!e.reason.isEmpty();return e;
    }
    static Instant instant(Property p)throws IOException{
        try{String v=p.value;boolean utc=v.endsWith("Z");if(utc)v=v.substring(0,v.length()-1);if(v.matches("[0-9]{8}T[0-9]{4}"))v+="00";LocalDateTime local=LocalDateTime.parse(v,STAMP);ZoneId zone=utc?ZoneOffset.UTC:zone(p.params.get("TZID"));if(zone.getRules().getValidOffsets(local).size()!=1)throw new IOException("夏令时切换时刻请在苹果日历中编辑");return local.atZone(zone).toInstant();}catch(DateTimeException e){throw new IOException("日程时区暂不支持");}
    }
    static ZoneId zone(String name)throws IOException{
        if(name==null||name.isEmpty())return DISPLAY;
        try{return ZoneId.of(name);}catch(DateTimeException e){String prefix="/freeassociation.sourceforge.net/Tzfile/";if(name.startsWith(prefix))try{return ZoneId.of(name.substring(prefix.length()));}catch(DateTimeException ignore){}throw new IOException("日程使用了暂不支持的自定义时区");}
    }
    private static long durationDays(String value)throws IOException{if(!value.matches("P[0-9]+[DW]"))throw new IOException("全天日程时长暂不支持");long n=Long.parseLong(value.substring(1,value.length()-1));return n*(value.endsWith("W")?7:1);}
    static void validate(Change c)throws IOException{
        if(badControls(c.title)||badControls(c.location)||badControls(c.notes))throw new IOException("日程不能包含控制字符");
        if(c.title==null||c.title.trim().isEmpty()||c.title.length()>160||(c.location!=null&&c.location.length()>300)||(c.notes!=null&&c.notes.length()>4000))throw new IOException("请填写有效的标题、位置与备注");
        try{LocalDate start=LocalDate.parse(c.date),end=LocalDate.parse(c.endDate);if(end.isBefore(start)||end.isAfter(start.plusYears(5)))throw new IOException("请填写有效的结束日期");if(!c.allDay){Instant a=input(c.date,c.time),b=input(c.endDate,c.endTime);if(!b.isAfter(a))throw new IOException("结束时间需要晚于开始时间");}}catch(DateTimeException e){throw new IOException("请填写有效的日期和时间");}
    }
    static Instant input(String date,String time)throws IOException{try{if(time==null||!time.matches("[0-2][0-9]:[0-5][0-9]"))throw new IOException("请填写有效的时间");LocalDateTime local=LocalDateTime.of(LocalDate.parse(date),LocalTime.parse(time));if(DISPLAY.getRules().getValidOffsets(local).size()!=1)throw new IOException("这个时间处于夏令时切换，请换一个时间");return local.atZone(DISPLAY).toInstant();}catch(DateTimeException e){throw new IOException("请填写有效的日期和时间");}}
    static String create(String uid,Change c)throws IOException{
        validate(c);List<String> out=new ArrayList<>(Arrays.asList("BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//HomeView//Pro8 Calendar//ZH","CALSCALE:GREGORIAN","BEGIN:VEVENT","UID:"+uid,"DTSTAMP:"+stampNow()));
        out.add(timeLine("DTSTART",null,c,false));out.add(timeLine("DTEND",null,c,true));out.add("SUMMARY:"+escape(c.title.trim()));out.add("LOCATION:"+escape(c.location));out.add("DESCRIPTION:"+escape(c.notes));out.add("END:VEVENT");out.add("END:VCALENDAR");return fold(out);
    }
    static String edit(String original,String expectedUid,Change c)throws IOException{
        validate(c);List<Event> all=read(original);if(all.size()!=1||!all.get(0).uid.equals(expectedUid))throw new IOException("日程已变化，请刷新后重试");if(all.get(0).readonly)throw new IOException(all.get(0).reason);
        List<String> out=new ArrayList<>();Set<String> replaced=new HashSet<>();int depth=0;boolean inside=false;
        for(String line:lines(original)){Property p=new Property(line);
            if(p.name.equals("BEGIN")){out.add(line);if(p.value.equalsIgnoreCase("VEVENT")){inside=true;depth=1;}else if(inside)depth++;continue;}
            if(p.name.equals("END")){if(inside&&depth==1){for(String key:new String[]{"DTEND","SUMMARY","LOCATION","DESCRIPTION","DTSTAMP"})if(!replaced.contains(key))out.add(replacement(key,null,c));inside=false;}else if(inside)depth--;out.add(line);continue;}
            if(inside&&depth==1){String k=p.name;if(k.equals("DURATION"))continue;if(Arrays.asList("DTSTART","DTEND","SUMMARY","LOCATION","DESCRIPTION","DTSTAMP","LAST-MODIFIED","SEQUENCE").contains(k)){if(replaced.add(k)){if(k.equals("SEQUENCE")){int seq;try{seq=Integer.parseInt(p.value);}catch(Exception e){throw new IOException("特殊日程序号，仅支持查看");}out.add(p.head+":"+(seq+1));}else out.add(replacement(k,p,c));}continue;}}
            out.add(line);
        }return fold(out);
    }
    private static String replacement(String key,Property old,Change c)throws IOException{
        if(key.equals("DTSTART")||key.equals("DTEND"))return timeLine(key,old,c,key.equals("DTEND"));String head=old==null?key:old.head;
        return head+":"+(key.equals("SUMMARY")?escape(c.title.trim()):key.equals("LOCATION")?escape(c.location):key.equals("DESCRIPTION")?escape(c.notes):stampNow());
    }
    private static String timeLine(String name,Property old,Change c,boolean end)throws IOException{
        String head=name;String date=end?c.endDate:c.date;List<String> extra=new ArrayList<>();if(old!=null)for(String part:split(old.head,';').subList(1,split(old.head,';').size())){String key=part.split("=",2)[0];if(!key.equalsIgnoreCase("TZID")&&!key.equalsIgnoreCase("VALUE"))extra.add(part);}
        if(c.allDay){head+=";VALUE=DATE";for(String p:extra)head+=";"+p;return head+":"+(end?LocalDate.parse(date).plusDays(1):LocalDate.parse(date)).format(DAY);}
        Instant value=input(date,end?c.endTime:c.time);String tz=old==null?null:old.params.get("TZID");boolean floating=old!=null&&tz==null&&!old.value.endsWith("Z")&&!old.params.containsKey("VALUE");
        if(tz!=null){head+=";TZID="+(tz.indexOf(':')>=0?"\""+tz+"\"":tz);}for(String p:extra)head+=";"+p;return head+":"+(tz!=null?STAMP.format(value.atZone(zone(tz))):floating?STAMP.format(value.atZone(DISPLAY)):STAMP.format(value.atOffset(ZoneOffset.UTC))+"Z");
    }
    private static String stampNow(){return STAMP.format(Instant.now().atOffset(ZoneOffset.UTC))+"Z";}
    private static boolean badControls(String v){if(v==null)return false;for(char c:v.toCharArray())if(c<32&&c!='\n'&&c!='\r'&&c!='\t')return true;return false;}
    static String escape(String s){return s==null?"":s.replace("\\","\\\\").replace("\r\n","\n").replace('\r','\n').replace("\n","\\n").replace(";","\\;").replace(",","\\,");}
    static String text(String s){StringBuilder out=new StringBuilder();boolean slash=false;for(char c:s.toCharArray()){if(slash){out.append(c=='n'||c=='N'?'\n':c);slash=false;}else if(c=='\\')slash=true;else out.append(c);}if(slash)out.append('\\');return out.toString();}
    static String fold(List<String> lines){StringBuilder out=new StringBuilder();for(String line:lines){int width=0;for(int i=0;i<line.length();){int cp=line.codePointAt(i);String ch=new String(Character.toChars(cp));int n=ch.getBytes(StandardCharsets.UTF_8).length;if(width+n>75){out.append("\r\n ");width=1;}out.append(ch);width+=n;i+=Character.charCount(cp);}out.append("\r\n");}return out.toString();}
    private static String value(Map<String,Property> p,String k){return p.containsKey(k)?p.get(k).value:"";}
    private static int delimiter(String s,char needle){boolean quote=false;for(int i=0;i<s.length();i++){char c=s.charAt(i);if(c=='"')quote=!quote;if(c==needle&&!quote)return i;}return -1;}
    private static List<String> split(String s,char needle){List<String> result=new ArrayList<>();int start=0;boolean quote=false;for(int i=0;i<s.length();i++){char c=s.charAt(i);if(c=='"')quote=!quote;if(c==needle&&!quote){result.add(s.substring(start,i));start=i+1;}}result.add(s.substring(start));return result;}
}
