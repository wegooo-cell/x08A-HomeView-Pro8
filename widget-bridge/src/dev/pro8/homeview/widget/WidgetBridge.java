/* SPDX-License-Identifier: GPL-3.0-only */
package dev.pro8.homeview.widget;

import android.content.*;
import android.content.pm.*;
import android.database.*;
import android.net.Uri;
import android.os.*;
import java.io.FileNotFoundException;
import java.security.MessageDigest;

/** A fixed, read-only title/cover interface between two first-party signing identities. */
public final class WidgetBridge extends ContentProvider {
 private static final String MAIN="io.github.wegooo_cell.homeview";
 private static final String MAIN_CERT="63f269706aaecd9e301e53b5a30f929a4344020c33759b4f30366be46a9c9c00";
 private static final String SOURCE="dev.pro8.bili.widget",AUTH="io.github.wegooo_cell.homeview.bili_bridge";
 private static final String[] COLUMNS={"title","bvid","updated_at","cover_uri","source","pending","available"};
 private boolean watching;
 public boolean onCreate(){return true;}
 private void caller(){
  PackageManager pm=getContext().getPackageManager();String[] names=pm.getPackagesForUid(Binder.getCallingUid());
  if(names!=null)for(String name:names)if(MAIN.equals(name))try{
   Signature[] signatures=pm.getPackageInfo(name,PackageManager.GET_SIGNATURES).signatures;
   if(signatures!=null&&signatures.length==1){byte[] digest=MessageDigest.getInstance("SHA-256").digest(signatures[0].toByteArray());StringBuilder hex=new StringBuilder();for(byte b:digest)hex.append(String.format(java.util.Locale.ROOT,"%02x",b&255));if(MAIN_CERT.equals(hex.toString()))return;}
  }catch(Exception ignored){}
  throw new SecurityException("HomeView component caller is not trusted");
 }
 private static String text(Cursor c,String name){int i=c.getColumnIndex(name);return i<0||c.isNull(i)?"":c.getString(i);}
 private static String bounded(String value,int max){return value.length()>max?value.substring(0,max):value;}
 private void observe(){if(watching)return;try{
  getContext().getContentResolver().registerContentObserver(Uri.parse("content://"+SOURCE+"/snapshot"),true,new ContentObserver(new Handler(Looper.getMainLooper())){public void onChange(boolean self){getContext().getContentResolver().notifyChange(Uri.parse("content://"+AUTH+"/snapshot"),null);}});watching=true;
 }catch(RuntimeException ignored){}}
 public Cursor query(Uri uri,String[] projection,String selection,String[] args,String sort){
  caller();if(!AUTH.equals(uri.getAuthority())||!"/snapshot".equals(uri.getPath())||selection!=null||args!=null)throw new IllegalArgumentException("Unsupported metadata request");
  MatrixCursor out=new MatrixCursor(COLUMNS);long identity=Binder.clearCallingIdentity();
  try{observe();try(Cursor c=getContext().getContentResolver().query(Uri.parse("content://"+SOURCE+"/snapshot"),null,null,null,null)){
   if(c!=null&&c.moveToFirst()){
    String id=text(c,"bvid"),cover=text(c,"cover_uri");boolean ready="1".equals(text(c,"available"))&&id.matches("BV[A-Za-z0-9]{10}")&&cover.equals("content://"+SOURCE+"/cover/"+id);
    long at=0;try{at=Math.max(0,Long.parseLong(text(c,"updated_at")));}catch(NumberFormatException ignored){}
    out.addRow(new Object[]{bounded(text(c,"title"),500),id.matches("BV[A-Za-z0-9]{10}")?id:"",at,ready?"content://"+AUTH+"/cover/"+id:"","dynamic".equals(text(c,"source"))?"dynamic":"recommendation","1".equals(text(c,"pending"))?1:0,ready?1:0});return out;
   }
  }}catch(RuntimeException ignored){}finally{Binder.restoreCallingIdentity(identity);}
  out.addRow(new Object[]{"","",0,"","",0,0});return out;
 }
 public ParcelFileDescriptor openFile(Uri uri,String mode)throws FileNotFoundException{
  caller();if(!AUTH.equals(uri.getAuthority())||!"r".equals(mode)||uri.getPathSegments().size()!=2||!"cover".equals(uri.getPathSegments().get(0))||!uri.getPathSegments().get(1).matches("BV[A-Za-z0-9]{10}"))throw new FileNotFoundException();
  long identity=Binder.clearCallingIdentity();try{return getContext().getContentResolver().openFileDescriptor(Uri.parse("content://"+SOURCE+"/cover/"+uri.getPathSegments().get(1)),"r");}finally{Binder.restoreCallingIdentity(identity);}
 }
 public String getType(Uri uri){caller();return uri.getPath()!=null&&uri.getPath().startsWith("/cover/")?"image/jpeg":"vnd.android.cursor.item/vnd.homeview.video-summary";}
 public Uri insert(Uri uri,ContentValues values){throw new UnsupportedOperationException("Read only");}
 public int update(Uri uri,ContentValues values,String selection,String[] args){throw new UnsupportedOperationException("Read only");}
 public int delete(Uri uri,String selection,String[] args){throw new UnsupportedOperationException("Read only");}
}
