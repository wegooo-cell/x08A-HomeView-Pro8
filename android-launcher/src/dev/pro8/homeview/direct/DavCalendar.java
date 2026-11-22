package dev.pro8.homeview.direct;

import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.*;
import java.util.*;
import javax.xml.parsers.*;
import org.w3c.dom.*;

/** CalDAV discovery and conditional ordinary-event writes. No Android or UI dependency. */
final class DavCalendar {
    static final String DAV="DAV:",CAL="urn:ietf:params:xml:ns:caldav",APPLE="http://apple.com/ns/ical/";
    static final URI ENTRY=URI.create("https://caldav.icloud.com/");
    static final class Credentials {final String email,password;Credentials(String email,String password){this.email=email;this.password=password;}}
    static final class CalendarInfo {String id,name,color;URI href;boolean writable;}
    static final class Resource {String id,etag,raw;URI href;List<ICalendar.Event> events;}
    static final class Failure extends IOException {final int status;Failure(int status,String message){super(message);this.status=status;}}
    private static final class Call {final URI uri;final DavHttp.Reply reply;Call(URI uri,DavHttp.Reply reply){this.uri=uri;this.reply=reply;}}
    private static final class Props {URI href;Map<String,Element> values=new HashMap<>();Element get(String ns,String name){return values.get(ns+"|"+name);}}
    private final DavHttp.Transport transport;
    DavCalendar(DavHttp.Transport transport){this.transport=transport;}
    List<CalendarInfo> discover(Credentials credentials)throws Exception{
        Call first=request(credentials,"PROPFIND",ENTRY,headers("Depth","0"),xml("<d:propfind xmlns:d='DAV:'><d:prop><d:current-user-principal/></d:prop></d:propfind>"));
        require(first.reply,207);URI principal=null;for(Props p:props(first))if(principal==null)principal=href(first.uri,p.get(DAV,"current-user-principal"));if(principal==null)throw new IOException("未能发现iCloud日历账户");
        Call second=request(credentials,"PROPFIND",principal,headers("Depth","0"),xml("<d:propfind xmlns:d='DAV:' xmlns:c='"+CAL+"'><d:prop><c:calendar-home-set/></d:prop></d:propfind>"));require(second.reply,207);URI home=null;for(Props p:props(second))if(home==null)home=href(second.uri,p.get(CAL,"calendar-home-set"));if(home==null)throw new IOException("未能发现日历目录");
        Call list=request(credentials,"PROPFIND",home,headers("Depth","1"),xml("<d:propfind xmlns:d='DAV:' xmlns:c='"+CAL+"' xmlns:a='"+APPLE+"'><d:prop><d:displayname/><d:resourcetype/><a:calendar-color/><c:supported-calendar-component-set/><d:current-user-privilege-set/></d:prop></d:propfind>"));require(list.reply,207);
        List<CalendarInfo> out=new ArrayList<>();for(Props p:props(list)){
            if(!has(p.get(DAV,"resourcetype"),CAL,"calendar"))continue;Element support=p.get(CAL,"supported-calendar-component-set");if(support!=null){NodeList components=support.getElementsByTagNameNS(CAL,"comp");boolean events=false;for(int i=0;i<components.getLength();i++)if("VEVENT".equals(((Element)components.item(i)).getAttribute("name")))events=true;if(!events)continue;}
            CalendarInfo c=new CalendarInfo();c.href=p.href;if(!c.href.getPath().endsWith("/"))c.href=DavHttp.safe(URI.create(c.href.toString()+"/"));c.id=id(c.href.toString());c.name=content(p.get(DAV,"displayname"));if(c.name.isEmpty())c.name="iCloud日历";if(c.name.length()>80)c.name=c.name.substring(0,80);c.color=content(p.get(APPLE,"calendar-color"));if(c.color.matches("#[0-9a-fA-F]{8}"))c.color=c.color.substring(0,7);if(!c.color.matches("#[0-9a-fA-F]{6}"))c.color="#168bff";Element priv=p.get(DAV,"current-user-privilege-set");c.writable=has(priv,DAV,"all")||has(priv,DAV,"write");out.add(c);if(out.size()>40)throw new IOException("日历数量超出本机支持范围");
        }return out;
    }
    List<Resource> fetch(Credentials credentials,CalendarInfo calendar,LocalDate start,LocalDate end)throws Exception{
        if(!end.isAfter(start)||end.isAfter(start.plusDays(370)))throw new IOException("请选择一年以内的日期范围");
        String a=ICalendar.STAMP.format(start.atStartOfDay(ICalendar.DISPLAY).withZoneSameInstant(ZoneOffset.UTC))+"Z",b=ICalendar.STAMP.format(end.atStartOfDay(ICalendar.DISPLAY).withZoneSameInstant(ZoneOffset.UTC))+"Z";
        String query="<c:calendar-query xmlns:d='DAV:' xmlns:c='"+CAL+"'><d:prop><d:getetag/><c:calendar-data><c:expand start='"+a+"' end='"+b+"'/></c:calendar-data></d:prop><c:filter><c:comp-filter name='VCALENDAR'><c:comp-filter name='VEVENT'><c:time-range start='"+a+"' end='"+b+"'/></c:comp-filter></c:comp-filter></c:filter></c:calendar-query>";
        Call response=request(credentials,"REPORT",calendar.href,headers("Depth","1"),xml(query));require(response.reply,207);List<Resource> out=new ArrayList<>();for(Props p:props(response)){Element data=p.get(CAL,"calendar-data");if(data==null)continue;ensureChild(calendar.href,p.href);Resource r=new Resource();r.href=p.href;r.id=id(r.href.toString());r.etag=content(p.get(DAV,"getetag"));r.raw=content(data);r.events=ICalendar.read(r.raw);out.add(r);if(out.size()>500)throw new IOException("此日期范围日程过多，请缩小到月或周查看");}return out;
    }
    String version(Credentials credentials,CalendarInfo calendar)throws Exception{
        Call response=request(credentials,"PROPFIND",calendar.href,headers("Depth","0"),xml("<d:propfind xmlns:d='DAV:' xmlns:cs='http://calendarserver.org/ns/'><d:prop><cs:getctag/><d:sync-token/></d:prop></d:propfind>"));
        if(response.reply.code==404||response.reply.code==405||response.reply.code==501)return "";require(response.reply,207);
        for(Props p:props(response))if(p.href.equals(calendar.href)){String ctag=content(p.get("http://calendarserver.org/ns/","getctag")),sync=content(p.get(DAV,"sync-token"));if(!ctag.isEmpty()&&ctag.length()<1024)return "c:"+ctag;if(!sync.isEmpty()&&sync.length()<1024)return "s:"+sync;}return "";
    }
    Resource get(Credentials credentials,URI uri)throws Exception{
        Call response=request(credentials,"GET",uri,new HashMap<String,String>(),null);require(response.reply,200);Resource r=new Resource();r.href=response.uri;r.id=id(uri.toString());r.etag=response.reply.header("etag");r.raw=response.reply.text();r.events=ICalendar.read(r.raw);return r;
    }
    void put(Credentials credentials,URI uri,String raw,String etag,boolean create)throws Exception{
        if(!create&&(etag==null||etag.isEmpty()||etag.startsWith("W/")))throw new IOException("服务未提供可写版本标记，请刷新后重试");Map<String,String> h=headers(create?"If-None-Match":"If-Match",create?"*":etag);h.put("Content-Type","text/calendar; charset=utf-8");Call response=request(credentials,"PUT",uri,h,raw.getBytes(StandardCharsets.UTF_8));require(response.reply,200,201,204);
    }
    void delete(Credentials credentials,URI uri,String etag)throws Exception{
        if(etag==null||etag.isEmpty()||etag.startsWith("W/"))throw new IOException("服务未提供可写版本标记，请刷新后重试");Call response=request(credentials,"DELETE",uri,headers("If-Match",etag),null);require(response.reply,200,204,404);
    }
    private Call request(Credentials credentials,String method,URI uri,Map<String,String> headers,byte[] body)throws Exception{
        Map<String,String> h=new LinkedHashMap<>(headers);h.put("Authorization","Basic "+Base64.getEncoder().encodeToString((credentials.email+":"+credentials.password).getBytes(StandardCharsets.UTF_8)));if(body!=null&&!h.containsKey("Content-Type"))h.put("Content-Type","application/xml; charset=utf-8");h.put("Accept","application/xml, text/calendar");
        for(int redirect=0;redirect<5;redirect++){DavHttp.safe(uri);DavHttp.Reply response=transport.request(method,uri,h,body);int code=response.code;if(code==301||code==302||code==307||code==308){if((method.equals("PUT")||method.equals("DELETE"))&&code!=307&&code!=308)throw new IOException("日历写入发生重定向，请刷新后重试");String location=response.header("location");if(location.isEmpty())throw new IOException("日历服务重定向无效");uri=DavHttp.resolve(uri,location);continue;}return new Call(uri,response);}throw new IOException("日历服务重定向次数过多");
    }
    static void require(DavHttp.Reply response,int... accepted)throws Failure{
        for(int c:accepted)if(response.code==c)return;int c=response.code;
        throw new Failure(c,c==401?"Apple邮箱或App专用密码无效，请重新连接":c==403?"没有这个日历的操作权限":c==412?"日程已在其他设备修改，请刷新后再编辑":c==429?"iCloud请求过于频繁，请稍后重试":c>=500?"iCloud暂时不可用，请稍后重试":"iCloud请求未完成（"+c+"）");
    }
    static void ensureChild(URI collection,URI uri)throws IOException{DavHttp.safe(uri);if(!Objects.equals(collection.getHost(),uri.getHost())||!uri.getPath().startsWith(collection.getPath())||uri.getPath().equals(collection.getPath()))throw new IOException("日历返回了目录之外的日程地址");}
    static String id(String value){try{byte[] b=MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));StringBuilder s=new StringBuilder();for(byte x:b)s.append(String.format(Locale.ROOT,"%02x",x&255));return s.toString();}catch(Exception e){throw new IllegalStateException(e);}}
    private static Map<String,String> headers(String k,String v){Map<String,String> out=new LinkedHashMap<>();out.put(k,v);return out;}
    private static byte[] xml(String value){return ("<?xml version='1.0' encoding='utf-8'?>"+value).getBytes(StandardCharsets.UTF_8);}
    private static List<Props> props(Call call)throws Exception{
        String xml=call.reply.text();if(xml.contains("<!DOCTYPE")||xml.contains("<!ENTITY"))throw new IOException("日历XML包含不受支持的声明");DocumentBuilderFactory factory=DocumentBuilderFactory.newInstance();factory.setNamespaceAware(true);factory.setValidating(false);factory.setExpandEntityReferences(false);for(String feature:new String[]{"http://xml.org/sax/features/external-general-entities","http://xml.org/sax/features/external-parameter-entities","http://apache.org/xml/features/nonvalidating/load-external-dtd"})try{factory.setFeature(feature,false);}catch(ParserConfigurationException ignored){}
        DocumentBuilder parser=factory.newDocumentBuilder();parser.setEntityResolver((publicId,systemId)->{throw new org.xml.sax.SAXException("External XML is not allowed");});parser.setErrorHandler(new org.xml.sax.helpers.DefaultHandler(){public void error(org.xml.sax.SAXParseException e)throws org.xml.sax.SAXException{throw e;}public void fatalError(org.xml.sax.SAXParseException e)throws org.xml.sax.SAXException{throw e;}});Document doc=parser.parse(new ByteArrayInputStream(xml.getBytes(StandardCharsets.UTF_8)));NodeList responses=doc.getElementsByTagNameNS(DAV,"response");if(responses.getLength()>600)throw new IOException("日历数据超出本机处理上限");List<Props> out=new ArrayList<>();
        for(int i=0;i<responses.getLength();i++){Element response=(Element)responses.item(i);Element directHref=child(response,DAV,"href");if(directHref==null)continue;Props p=new Props();p.href=DavHttp.resolve(call.uri,directHref.getTextContent().trim());for(Element stat:children(response,DAV,"propstat")){Element status=child(stat,DAV,"status");if(status==null||!status.getTextContent().trim().matches("HTTP/1\\.[01] 200(?: .*)?"))continue;Element prop=child(stat,DAV,"prop");if(prop==null)continue;for(Node n=prop.getFirstChild();n!=null;n=n.getNextSibling())if(n instanceof Element)p.values.put(n.getNamespaceURI()+"|"+n.getLocalName(),(Element)n);}out.add(p);}return out;
    }
    private static String content(Element el){return el==null?"":el.getTextContent().trim();}
    private static URI href(URI base,Element el)throws IOException{if(el==null)return null;NodeList links=el.getElementsByTagNameNS(DAV,"href");return links.getLength()==0?null:DavHttp.resolve(base,links.item(0).getTextContent().trim());}
    private static boolean has(Element el,String ns,String name){return el!=null&&el.getElementsByTagNameNS(ns,name).getLength()>0;}
    private static Element child(Element parent,String ns,String name){for(Node n=parent.getFirstChild();n!=null;n=n.getNextSibling())if(n instanceof Element&&ns.equals(n.getNamespaceURI())&&name.equals(n.getLocalName()))return (Element)n;return null;}
    private static List<Element> children(Element parent,String ns,String name){List<Element> out=new ArrayList<>();for(Node n=parent.getFirstChild();n!=null;n=n.getNextSibling())if(n instanceof Element&&ns.equals(n.getNamespaceURI())&&name.equals(n.getLocalName()))out.add((Element)n);return out;}
}
