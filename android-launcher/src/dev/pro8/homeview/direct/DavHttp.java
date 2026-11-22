package dev.pro8.homeview.direct;

import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.zip.GZIPInputStream;
import javax.net.ssl.*;

/** Bounded HTTP/1.1 DAV transport. Default trust store and HTTPS hostname checks. */
final class DavHttp {
    interface Transport { Reply request(String method,URI uri,Map<String,String> headers,byte[] body)throws Exception; }
    static final class Reply {
        final int code;final Map<String,String> headers;final byte[] body;
        Reply(int code,Map<String,String> headers,byte[] body){this.code=code;this.headers=headers;this.body=body;}
        String header(String key){return headers.getOrDefault(key.toLowerCase(Locale.ROOT),"");}
        String text(){return new String(body,StandardCharsets.UTF_8);}
    }
    static URI safe(URI uri)throws IOException{
        String host=uri.getHost(),path=uri.getPath();
        if(!"https".equals(uri.getScheme())||host==null||!host.toLowerCase(Locale.ROOT).matches("(?:p[0-9]{1,3}-)?caldav\\.icloud\\.com(?:\\.cn)?")||uri.getUserInfo()!=null||uri.getFragment()!=null||uri.getQuery()!=null||(uri.getPort()!=-1&&uri.getPort()!=443)||path==null||path.matches("(?s).*[\\r\\n\\x00].*")||Arrays.asList(path.split("/",-1)).contains(".."))throw new IOException("iCloud返回了不受支持的日历地址");
        return uri;
    }
    static URI resolve(URI base,String href)throws IOException{try{return safe(base.resolve(href));}catch(IllegalArgumentException e){throw new IOException("日历地址无效");}}
    static final class Network implements Transport {
        public Reply request(String method,URI uri,Map<String,String> headers,byte[] body)throws Exception{
            safe(uri);if(!Arrays.asList("GET","PROPFIND","REPORT","PUT","DELETE").contains(method))throw new IOException("请求无效");
            String host=uri.getHost();
            try(Socket tcp=new Socket()){
                tcp.connect(new InetSocketAddress(host,443),7000);tcp.setSoTimeout(12000);
                try(SSLSocket tls=(SSLSocket)((SSLSocketFactory)SSLSocketFactory.getDefault()).createSocket(tcp,host,443,true)){
                    tls.setSoTimeout(12000);SSLParameters parameters=tls.getSSLParameters();parameters.setEndpointIdentificationAlgorithm("HTTPS");tls.setSSLParameters(parameters);tls.startHandshake();
                    String target=uri.getRawPath();if(target==null||target.isEmpty())target="/";
                    StringBuilder head=new StringBuilder(method+" "+target+" HTTP/1.1\r\nHost: "+host+"\r\nConnection: close\r\nAccept-Encoding: identity\r\nUser-Agent: HomeView-Pro8/1\r\n");
                    for(Map.Entry<String,String> h:headers.entrySet()){if(!h.getKey().matches("[A-Za-z-]+")||h.getValue().indexOf('\r')>=0||h.getValue().indexOf('\n')>=0)throw new IOException("请求头无效");head.append(h.getKey()).append(": ").append(h.getValue()).append("\r\n");}
                    if(body!=null)head.append("Content-Length: ").append(body.length).append("\r\n");head.append("\r\n");
                    OutputStream out=tls.getOutputStream();out.write(head.toString().getBytes(StandardCharsets.ISO_8859_1));if(body!=null)out.write(body);out.flush();
                    return readReply(new BufferedInputStream(tls.getInputStream()));
                }
            }
        }
    }
    static Reply readReply(InputStream in)throws IOException{
        int code;Map<String,String> headers;
        do{
            String status=line(in,1024);if(!status.matches("HTTP/1\\.[01] [0-9]{3}.*"))throw new IOException("日历服务响应无效");code=Integer.parseInt(status.substring(9,12));headers=new LinkedHashMap<>();int size=0;
            while(true){String l=line(in,8192);size+=l.length();if(size>32768)throw new IOException("响应头过大");if(l.isEmpty())break;int colon=l.indexOf(':');if(colon<1)throw new IOException("响应头无效");String k=l.substring(0,colon).trim().toLowerCase(Locale.ROOT),v=l.substring(colon+1).trim();if(headers.containsKey(k)&&!headers.get(k).equals(v)&&(k.equals("content-length")||k.equals("transfer-encoding")))throw new IOException("响应长度无效");headers.put(k,v);}
        }while(code==100);
        final int limit=3*1024*1024;ByteArrayOutputStream body=new ByteArrayOutputStream();
        if(code!=204&&code!=304){
            String transfer=headers.getOrDefault("transfer-encoding","");
            if(!transfer.isEmpty()){
                if(!transfer.equalsIgnoreCase("chunked"))throw new IOException("响应编码不受支持");
                while(true){String chunk=line(in,128).split(";",2)[0].trim();long length;try{length=Long.parseLong(chunk,16);}catch(Exception e){throw new IOException("响应分块无效");}if(length<0||length>limit-body.size())throw new IOException("日历数据超出本机读取上限");if(length==0){int trailers=0;while(!line(in,8192).isEmpty())if(++trailers>32)throw new IOException("响应尾部过大");break;}copy(in,body,(int)length);if(!line(in,2).isEmpty())throw new IOException("响应分块无效");}
            }else if(headers.containsKey("content-length")){
                long length;try{length=Long.parseLong(headers.get("content-length"));}catch(Exception e){throw new IOException("响应长度无效");}if(length<0||length>limit)throw new IOException("日历数据超出本机读取上限");copy(in,body,(int)length);
            }else{byte[] buffer=new byte[8192];int n;while((n=in.read(buffer))!=-1){if(body.size()+n>limit)throw new IOException("日历数据超出本机读取上限");body.write(buffer,0,n);}}
        }
        byte[] bytes=body.toByteArray();String encoding=headers.getOrDefault("content-encoding","");
        if(encoding.equalsIgnoreCase("gzip")){body.reset();try(InputStream gzip=new GZIPInputStream(new ByteArrayInputStream(bytes))){byte[] buffer=new byte[8192];int n;while((n=gzip.read(buffer))!=-1){if(body.size()+n>limit)throw new IOException("日历数据超出本机读取上限");body.write(buffer,0,n);}}bytes=body.toByteArray();}else if(!encoding.isEmpty()&&!encoding.equalsIgnoreCase("identity"))throw new IOException("响应编码不受支持");
        return new Reply(code,headers,bytes);
    }
    private static String line(InputStream in,int limit)throws IOException{ByteArrayOutputStream out=new ByteArrayOutputStream();int c;while((c=in.read())!=-1){if(c=='\n')return out.toString("ISO-8859-1");if(c!='\r'){if(out.size()>=limit)throw new IOException("响应行过长");out.write(c);}}throw new EOFException("日历连接提前结束");}
    private static void copy(InputStream in,OutputStream out,int length)throws IOException{byte[] buf=new byte[8192];while(length>0){int n=in.read(buf,0,Math.min(length,buf.length));if(n<0)throw new EOFException("日历连接提前结束");out.write(buf,0,n);length-=n;}}
}
