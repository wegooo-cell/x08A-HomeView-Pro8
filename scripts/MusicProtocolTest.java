package dev.pro8.homeview.direct;
import org.json.JSONObject;
import java.nio.file.*;
import javax.crypto.Cipher;
import javax.crypto.spec.SecretKeySpec;
import java.security.MessageDigest;
public final class MusicProtocolTest {
 static int passed;static void ok(boolean b){if(!b)throw new AssertionError();passed++;}
 static byte[] bytes(String s){byte[] b=new byte[s.length()/2];for(int i=0;i<b.length;i++)b[i]=(byte)Integer.parseInt(s.substring(i*2,i*2+2),16);return b;}
 static String hex(byte[] b){StringBuilder s=new StringBuilder();for(byte v:b)s.append(String.format("%02x",v&255));return s.toString();}
 public static void main(String[] args)throws Exception{
  JSONObject fixture=new JSONObject(new String(Files.readAllBytes(Paths.get(args[0])),"UTF-8"));
  for(boolean like:new boolean[]{true,false}){
   JSONObject body=new JSONObject().put("id","8000").put("like",like),p=MusicLibrary.like(body);
   String wire=NetEaseProtocol.clientForm("/api/radio/like",p);if(!wire.equals(fixture.getString(Boolean.toString(like))))System.out.println("Vector payload: "+p);ok(wire.equals(fixture.getString(Boolean.toString(like))));
   Cipher c=Cipher.getInstance("AES/ECB/PKCS5Padding");c.init(Cipher.DECRYPT_MODE,new SecretKeySpec("e82ckenh8dichen8".getBytes("UTF-8"),"AES"));
   String plain=new String(c.doFinal(bytes(wire.substring(7))),"UTF-8");String[] parts=plain.split("-36cd479b6b5-");
   ok(parts[0].equals("/api/radio/like"));JSONObject data=new JSONObject(parts[1]);ok(data.getBoolean("like")==like&&data.getString("trackId").equals("8000"));ok(parts[2].equals(hex(MessageDigest.getInstance("MD5").digest(("nobody"+parts[0]+"use"+parts[1]+"md5forencrypt").getBytes("UTF-8")))));
  }
  for(String path:new String[]{"https://evil.example/api/like","/api/like?x=1","../like"})try{NetEaseProtocol.clientForm(path,new JSONObject());throw new AssertionError();}catch(IllegalArgumentException expected){passed++;}
  try{MusicLibrary.like(new JSONObject().put("id","8000").put("like","false"));throw new AssertionError();}catch(IllegalArgumentException expected){passed++;}
  ok(new MusicServiceException(-460).getMessage().contains("音乐服务"));ok(!new MusicServiceException(-460).getMessage().contains("Wi-Fi"));ok(new MusicServiceException(301).getMessage().contains("登录已过期"));ok(new MusicServiceException(429).getMessage().contains("频繁"));
  System.out.println("MusicProtocolTest: "+passed+" passed (independent Node cipher vectors, both heart operations, error classification)");
 }
}
