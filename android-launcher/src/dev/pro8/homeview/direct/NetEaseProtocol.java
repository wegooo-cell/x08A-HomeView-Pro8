package dev.pro8.homeview.direct;

import java.security.KeyFactory;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.security.spec.X509EncodedKeySpec;
import java.util.Base64;
import java.util.Locale;
import java.net.URLEncoder;
import javax.crypto.Cipher;
import javax.crypto.spec.IvParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.json.JSONObject;

/** WEAPI wire format using standard JCA; no account values leave native storage. */
final class NetEaseProtocol {
    private static final String PUBLIC_KEY="MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDgtQn2JZ34ZC28NWYpAUd98iZ37BUrX/aKzmFbt7clFSs6sXqHauqKWqdtLkF2KexO40H1YTX8z2lSgBBOAxLsvaklV8k4cBFK9snQXE9/DDaFt6Rr7iVZMldczhC0JNgTz+SHXT6CBHuX3e9SdB1Ua44oncaTWz7OBGLbCiK45wIDAQAB";
    private static final SecureRandom RANDOM=new SecureRandom();
    static String form(JSONObject payload,String csrf)throws Exception{
        String chars="abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";StringBuilder secret=new StringBuilder();
        for(int i=0;i<16;i++)secret.append(chars.charAt(RANDOM.nextInt(chars.length())));
        return form(payload,csrf,secret.toString());
    }
    static String form(JSONObject payload,String csrf,String secret)throws Exception{
        if(!secret.matches("[A-Za-z0-9]{16}"))throw new IllegalArgumentException("Invalid protocol key");
        JSONObject data=new JSONObject(payload.toString());data.put("csrf_token",csrf);
        String encrypted=aes(aes(data.toString(),"0CoJUm6Qyw8W8jud"),secret);
        Cipher rsa=Cipher.getInstance("RSA/ECB/NoPadding");rsa.init(Cipher.ENCRYPT_MODE,KeyFactory.getInstance("RSA").generatePublic(new X509EncodedKeySpec(Base64.getDecoder().decode(PUBLIC_KEY))));
        byte[] input=new byte[128],reversed=new StringBuilder(secret).reverse().toString().getBytes("UTF-8");System.arraycopy(reversed,0,input,input.length-reversed.length,reversed.length);
        byte[] bytes=rsa.doFinal(input);StringBuilder hex=new StringBuilder();for(byte b:bytes)hex.append(String.format(Locale.ROOT,"%02x",b&255));
        return "params="+URLEncoder.encode(encrypted,"UTF-8")+"&encSecKey="+hex;
    }
    /** Desktop-client request envelope. The path is included in the authenticated digest. */
    static String clientForm(String path,JSONObject payload)throws Exception{
        if(!path.matches("/api/[a-zA-Z0-9/]+"))throw new IllegalArgumentException("Invalid music request path");
        String text=payload.toString();
        byte[] digest=MessageDigest.getInstance("MD5").digest(("nobody"+path+"use"+text+"md5forencrypt").getBytes("UTF-8"));
        String plain=path+"-36cd479b6b5-"+text+"-36cd479b6b5-"+hex(digest);
        Cipher cipher=Cipher.getInstance("AES/ECB/PKCS5Padding");
        cipher.init(Cipher.ENCRYPT_MODE,new SecretKeySpec("e82ckenh8dichen8".getBytes("UTF-8"),"AES"));
        return "params="+hex(cipher.doFinal(plain.getBytes("UTF-8"))).toUpperCase(Locale.ROOT);
    }
    private static String hex(byte[] bytes){StringBuilder out=new StringBuilder();for(byte b:bytes)out.append(String.format(Locale.ROOT,"%02x",b&255));return out.toString();}
    private static String aes(String value,String key)throws Exception{
        Cipher cipher=Cipher.getInstance("AES/CBC/PKCS5Padding");cipher.init(Cipher.ENCRYPT_MODE,new SecretKeySpec(key.getBytes("UTF-8"),"AES"),new IvParameterSpec("0102030405060708".getBytes("UTF-8")));
        return Base64.getEncoder().encodeToString(cipher.doFinal(value.getBytes("UTF-8")));
    }
}
