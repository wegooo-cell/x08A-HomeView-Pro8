package dev.pro8.homeview.direct;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.AtomicFile;
import android.util.Base64;
import java.io.*;
import java.security.KeyStore;
import javax.crypto.*;
import javax.crypto.spec.GCMParameterSpec;
import org.json.JSONObject;

/** App-private account ciphertext; its non-exportable AES key stays in AndroidKeyStore. */
final class CalendarAccount implements CalendarSecrets {
    private static final String ALIAS="homeview.calendar.account.v1";
    private final AtomicFile file;
    CalendarAccount(Context c){file=new AtomicFile(new File(c.getFilesDir(),"calendar-account.enc"));}
    private SecretKey key(boolean create)throws Exception{
        KeyStore store=KeyStore.getInstance("AndroidKeyStore");store.load(null);if(store.containsAlias(ALIAS))return ((KeyStore.SecretKeyEntry)store.getEntry(ALIAS,null)).getSecretKey();if(!create)throw new IOException("日历账户密钥不可用，请重新连接");
        KeyGenerator generator=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");generator.init(new KeyGenParameterSpec.Builder(ALIAS,KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setUserAuthenticationRequired(false).build());return generator.generateKey();
    }
    public DavCalendar.Credentials read()throws Exception{
        if(!file.getBaseFile().exists()&&!new File(file.getBaseFile()+".bak").exists())return null;
        JSONObject data;try(InputStream in=file.openRead()){data=new JSONObject(new String(NetEaseClient.read(in,8192),"UTF-8"));}
        Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.DECRYPT_MODE,key(false),new GCMParameterSpec(128,Base64.decode(data.getString("iv"),Base64.NO_WRAP)));byte[] raw=cipher.doFinal(Base64.decode(data.getString("data"),Base64.NO_WRAP));try{JSONObject value=new JSONObject(new String(raw,"UTF-8"));return new DavCalendar.Credentials(value.getString("email"),value.getString("password"));}finally{java.util.Arrays.fill(raw,(byte)0);}
    }
    public void save(DavCalendar.Credentials value)throws Exception{
        Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,key(true));byte[] raw=NetEaseClient.obj("email",value.email,"password",value.password).toString().getBytes("UTF-8");byte[] sealed;try{sealed=cipher.doFinal(raw);}finally{java.util.Arrays.fill(raw,(byte)0);}
        JSONObject data=NetEaseClient.obj("iv",Base64.encodeToString(cipher.getIV(),Base64.NO_WRAP),"data",Base64.encodeToString(sealed,Base64.NO_WRAP));FileOutputStream out=null;try{out=file.startWrite();out.write(data.toString().getBytes("UTF-8"));file.finishWrite(out);}catch(Exception e){if(out!=null)file.failWrite(out);throw e;}
    }
    public void clear()throws Exception{file.delete();KeyStore store=KeyStore.getInstance("AndroidKeyStore");store.load(null);if(store.containsAlias(ALIAS))store.deleteEntry(ALIAS);}
}
