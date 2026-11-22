package dev.pro8.homeview.direct;

import org.json.JSONObject;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.security.spec.MGF1ParameterSpec;
import java.util.*;
import javax.crypto.Cipher;
import javax.crypto.spec.*;

/** One short-lived Wi-Fi form. Never exposes calendar reads or general control APIs. */
final class CalendarMobile implements Closeable {
    interface Assets { byte[] read(String name) throws Exception; }
    interface Connect { void submit(JSONObject credentials) throws Exception; }
    private final Assets assets;
    private final Connect connect;
    private final long lifetime;
    private Session session;
    private static final SecureRandom RANDOM=new SecureRandom();
    private static final Set<String> FILES=new HashSet<>(Arrays.asList("index.html","phone.css","phone.js","forge.min.js"));
    private static final class Session {
        String id,token,host,url,pem,state="waiting";
        long expires;
        KeyPair keys;
        ServerSocket listener;
    }
    CalendarMobile(Assets assets,Connect connect){this(assets,connect,300000);}
    CalendarMobile(Assets assets,Connect connect,long lifetime){this.assets=assets;this.connect=connect;this.lifetime=lifetime;}
    synchronized JSONObject start(InetAddress address)throws Exception {
        if(!(address instanceof Inet4Address)||!address.isSiteLocalAddress()||address.isLoopbackAddress())throw new IllegalArgumentException("请先让 Pro8 连接家庭 Wi-Fi");
        close();
        Session s=new Session();s.id=UUID.randomUUID().toString();
        byte[] random=new byte[32];RANDOM.nextBytes(random);s.token=Base64.getUrlEncoder().withoutPadding().encodeToString(random);Arrays.fill(random,(byte)0);
        KeyPairGenerator generator=KeyPairGenerator.getInstance("RSA");generator.initialize(2048,RANDOM);s.keys=generator.generateKeyPair();
        s.pem="-----BEGIN PUBLIC KEY-----\n"+Base64.getMimeEncoder(64,new byte[]{'\n'}).encodeToString(s.keys.getPublic().getEncoded())+"\n-----END PUBLIC KEY-----";
        s.listener=new ServerSocket();
        try{s.listener.bind(new InetSocketAddress(address,0),4);s.listener.setSoTimeout(1000);}catch(Exception e){s.listener.close();throw e;}
        s.host=address.getHostAddress()+":"+s.listener.getLocalPort();s.url="http://"+s.host+"/#"+s.token;s.expires=System.currentTimeMillis()+lifetime;session=s;
        Thread thread=new Thread(()->serve(s),"homeview-calendar-phone");thread.setDaemon(true);thread.start();return state(s.id);
    }
    synchronized JSONObject state(String id)throws Exception {
        Session s=session;
        if(s==null||!s.id.equals(id))return NetEaseClient.obj("ok",true,"state","closed");
        if(s.state.equals("waiting")&&System.currentTimeMillis()>=s.expires)finish(s,"expired");
        JSONObject r=NetEaseClient.obj("ok",true,"id",s.id,"state",s.state,"seconds",Math.max(0,(s.expires-System.currentTimeMillis()+999)/1000));
        if(s.state.equals("waiting"))r.put("url",s.url);return r;
    }
    synchronized String url(String id)throws Exception {JSONObject r=state(id);if(!r.optString("state").equals("waiting"))throw new IllegalArgumentException("二维码已失效，请刷新");return r.getString("url");}
    synchronized JSONObject cancel(String id)throws Exception {if(session!=null&&session.id.equals(id))finish(session,"closed");return state(id);}
    @Override public synchronized void close(){if(session!=null)finish(session,"closed");session=null;}
    private synchronized void finish(Session s,String state){s.state=state;s.token="";s.keys=null;s.pem="";s.url="";try{s.listener.close();}catch(Exception ignored){}}
    private synchronized boolean active(Session s){return session==s&&s.state.equals("waiting")&&System.currentTimeMillis()<s.expires;}
    private void serve(Session s){int requests=0;try{while(active(s)&&requests<100){
        try(Socket socket=s.listener.accept()){requests++;socket.setSoTimeout(3000);handle(s,socket);}catch(SocketTimeoutException ignored){}catch(Exception ignored){}
    }}finally{synchronized(this){if(s.state.equals("waiting"))finish(s,"expired");}}}
    private static String line(InputStream in,int limit)throws IOException {ByteArrayOutputStream b=new ByteArrayOutputStream();int c;while((c=in.read())!=-1){if(c=='\n')break;if(b.size()>=limit)throw new IOException();if(c!='\r')b.write(c);}if(c<0&&b.size()==0)throw new EOFException();return b.toString("ISO-8859-1");}
    private void handle(Session s,Socket socket)throws Exception {
        InetAddress peer=socket.getInetAddress();if(!peer.isSiteLocalAddress()&&!peer.isLoopbackAddress())return;
        InputStream in=socket.getInputStream();OutputStream out=socket.getOutputStream();String[] request=line(in,2048).split(" ");if(request.length!=3)return;
        Map<String,String> headers=new HashMap<>();int total=0;while(true){String l=line(in,2048);total+=l.length();if(total>8192)return;if(l.isEmpty())break;int p=l.indexOf(':');if(p<1)return;String k=l.substring(0,p).trim().toLowerCase(Locale.ROOT);if(headers.containsKey(k))return;headers.put(k,l.substring(p+1).trim());}
        if(!s.host.equals(headers.get("host"))||headers.containsKey("transfer-encoding")||!active(s)){reply(out,403,"text/plain","链接不可用".getBytes(StandardCharsets.UTF_8));return;}
        String method=request[0],path=request[1];
        if(method.equals("GET")&&(path.equals("/")||FILES.contains(path.startsWith("/")?path.substring(1):""))){String name=path.equals("/")?"index.html":path.substring(1);reply(out,200,name.endsWith(".js")?"application/javascript; charset=utf-8":name.endsWith(".css")?"text/css; charset=utf-8":"text/html; charset=utf-8",assets.read(name));return;}
        String provided=headers.getOrDefault("x-homeview-pair","");
        synchronized(this){if(!active(s)||!MessageDigest.isEqual(s.token.getBytes(StandardCharsets.US_ASCII),provided.getBytes(StandardCharsets.US_ASCII))){reply(out,403,"text/plain",new byte[0]);return;}}
        if(method.equals("GET")&&path.equals("/key")){synchronized(this){reply(out,200,"application/json",NetEaseClient.obj("ok",true,"pem",s.pem,"seconds",Math.max(0,(s.expires-System.currentTimeMillis())/1000)).toString().getBytes(StandardCharsets.UTF_8));}return;}
        if(method.equals("POST")&&path.equals("/submit")&&("http://"+s.host).equals(headers.get("origin"))&&"application/json".equals(headers.get("content-type"))){
            int n;try{n=Integer.parseInt(headers.getOrDefault("content-length","0"));}catch(Exception e){return;}if(n<20||n>4096){reply(out,413,"text/plain",new byte[0]);return;}
            byte[] body=new byte[n];new DataInputStream(in).readFully(body);boolean accepted=receive(s,provided,body);Arrays.fill(body,(byte)0);
            reply(out,accepted?200:400,"application/json",("{\"ok\":"+accepted+"}").getBytes(StandardCharsets.US_ASCII));return;
        }
        reply(out,404,"text/plain",new byte[0]);
    }
    private synchronized boolean receive(Session s,String token,byte[] body){
        if(!active(s))return false;
        KeyPair keys=s.keys;finish(s,"received"); // Consume before decrypt: one submission, no replay/decryption oracle.
        byte[] aes=null,plain=null;
        try{
            JSONObject b=new JSONObject(new String(body,StandardCharsets.UTF_8));if(b.optInt("v")!=1)throw new IOException();
            byte[] wrapped=Base64.getDecoder().decode(b.getString("key")),iv=Base64.getDecoder().decode(b.getString("iv")),ciphertext=Base64.getDecoder().decode(b.getString("data"));
            if(wrapped.length!=256||iv.length!=12||ciphertext.length<16||ciphertext.length>2048)throw new IOException();
            Cipher rsa=Cipher.getInstance("RSA/ECB/OAEPPadding");rsa.init(Cipher.DECRYPT_MODE,keys.getPrivate(),new OAEPParameterSpec("SHA-256","MGF1",MGF1ParameterSpec.SHA256,PSource.PSpecified.DEFAULT));aes=rsa.doFinal(wrapped);if(aes.length!=32)throw new IOException();
            Cipher gcm=Cipher.getInstance("AES/GCM/NoPadding");gcm.init(Cipher.DECRYPT_MODE,new SecretKeySpec(aes,"AES"),new GCMParameterSpec(128,iv));gcm.updateAAD(token.getBytes(StandardCharsets.US_ASCII));plain=gcm.doFinal(ciphertext);
            JSONObject credentials=new JSONObject(new String(plain,StandardCharsets.UTF_8));if(credentials.length()!=2||!credentials.has("email")||!credentials.has("password"))throw new IOException();
            connect.submit(credentials);credentials.remove("password");credentials.remove("email");s.state="submitted";return true;
        }catch(Exception ignored){s.state="failed";return false;}finally{if(aes!=null)Arrays.fill(aes,(byte)0);if(plain!=null)Arrays.fill(plain,(byte)0);}
    }
    private static void reply(OutputStream out,int status,String type,byte[] data)throws IOException {
        String h="HTTP/1.1 "+status+" Result\r\nContent-Type: "+type+"\r\nContent-Length: "+data.length+"\r\nConnection: close\r\nCache-Control: no-store\r\nReferrer-Policy: no-referrer\r\nX-Content-Type-Options: nosniff\r\nX-Frame-Options: DENY\r\nContent-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'\r\n\r\n";
        out.write(h.getBytes(StandardCharsets.US_ASCII));out.write(data);out.flush();
    }
}
