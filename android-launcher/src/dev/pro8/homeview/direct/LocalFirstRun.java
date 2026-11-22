package dev.pro8.homeview.direct;
import android.content.Context;import android.util.AtomicFile;import org.json.*;import java.io.*;import java.util.*;
/** Reversible HomeView-only profiles, kept in this app's private no-backup directory. */
final class LocalFirstRun {
 private static File root(Context c){return new File(c.getNoBackupFilesDir(),"homeview-profiles");}
 private static File request(Context c){return new File(root(c),"pending.json");}
 static File webState(Context c){return new File(root(c),"web-state.json");}
 static boolean canRestore(Context c){return new File(root(c),"latest.json").isFile();}
 private static JSONObject read(File f)throws Exception{try(InputStream in=new FileInputStream(f)){return new JSONObject(new String(NetEaseClient.read(in,8*1024*1024),"UTF-8"));}}
 private static void write(File f,JSONObject value)throws Exception{f.getParentFile().mkdirs();AtomicFile a=new AtomicFile(f);FileOutputStream out=null;try{out=a.startWrite();out.write(value.toString().getBytes("UTF-8"));a.finishWrite(out);}catch(Exception e){if(out!=null)a.failWrite(out);throw e;}}
 private static void copy(File from,File to)throws Exception{if(java.nio.file.Files.isSymbolicLink(from.toPath()))throw new IOException("Profile path is invalid");if(from.isDirectory()){if(!to.isDirectory()&&!to.mkdirs())throw new IOException("Backup directory unavailable");File[] list=from.listFiles();if(list==null)throw new IOException("Backup source unavailable");for(File child:list)copy(child,new File(to,child.getName()));return;}if(!from.isFile())return;to.getParentFile().mkdirs();AtomicFile a=new AtomicFile(to);FileOutputStream out=null;try{out=a.startWrite();try(InputStream in=new FileInputStream(from)){byte[] bytes=new byte[16384];int n;while((n=in.read(bytes))!=-1)out.write(bytes,0,n);}a.finishWrite(out);if(to.length()!=from.length())throw new IOException("Backup validation failed");}catch(Exception e){if(out!=null)a.failWrite(out);throw e;}}
 private static void remove(File f)throws Exception{if(java.nio.file.Files.isSymbolicLink(f.toPath()))throw new IOException("Profile path is invalid");if(f.isDirectory()){File[] list=f.listFiles();if(list==null)throw new IOException("Profile directory unavailable");for(File child:list)remove(child);}if(f.exists()&&!f.delete())throw new IOException("Profile cleanup incomplete");}
 private static File prefs(Context c){return new File(c.getApplicationInfo().dataDir,"shared_prefs");}
 private static File checkedProfile(Context c,String name)throws Exception{if(!name.matches("profile-[0-9]+-[a-f0-9-]{36}"))throw new IOException("Profile name is invalid");File f=new File(root(c),name);if(!new File(f,"complete.json").isFile())throw new IOException("Backup is incomplete");return f;}
 static synchronized JSONObject prepare(Context c,JSONObject storage,boolean restore)throws Exception{
  String previous=restore?read(new File(root(c),"latest.json")).getString("profile"):"";if(restore)checkedProfile(c,previous);
  File profile=new File(root(c),"profile-"+System.currentTimeMillis()+"-"+UUID.randomUUID());profile.mkdirs();
  File pref=prefs(c);File[] xml=pref.listFiles();if(xml!=null)for(File f:xml)if(f.getName().endsWith(".xml"))c.getSharedPreferences(f.getName().substring(0,f.getName().length()-4),0).edit().commit();
  File[] files=c.getFilesDir().listFiles();if(files!=null)for(File file:files)if(!file.getName().equals("homeview-album"))copy(file,new File(profile,"files/"+file.getName()));if(pref.isDirectory())copy(pref,new File(profile,"shared_prefs"));
  write(new File(profile,"web-storage.json"),storage);write(new File(profile,"complete.json"),new JSONObject().put("created",System.currentTimeMillis()).put("scope","HomeView configuration only; photos, Mi Home and Android retained"));
  if(!restore)write(new File(root(c),"latest.json"),new JSONObject().put("profile",profile.getName()));
  JSONObject pending=new JSONObject().put("operation",restore?"restore":"reset").put("profile",restore?previous:profile.getName());write(request(c),pending);return new JSONObject().put("ok",true).put("backed_up",true);
 }
 static synchronized void applyPending(Context c)throws Exception{
  if(!request(c).isFile())return;JSONObject plan=read(request(c));File profile=checkedProfile(c,plan.getString("profile"));boolean restore=plan.getString("operation").equals("restore");
  // A completed private backup exists before any active configuration is removed.
  File[] files=c.getFilesDir().listFiles();if(files!=null)for(File file:files)if(!file.getName().equals("homeview-album"))remove(file);
  File pref=prefs(c);if(pref.isDirectory()){File[] xml=pref.listFiles();if(xml!=null)for(File f:xml)if(f.getName().endsWith(".xml"))c.getSharedPreferences(f.getName().substring(0,f.getName().length()-4),0).edit().clear().commit();}
  if(restore){File savedFiles=new File(profile,"files");if(savedFiles.isDirectory()){File[] list=savedFiles.listFiles();if(list!=null)for(File f:list)copy(f,new File(c.getFilesDir(),f.getName()));}File savedPrefs=new File(profile,"shared_prefs");if(savedPrefs.isDirectory()){File[] list=savedPrefs.listFiles();if(list!=null)for(File f:list)if(f.getName().endsWith(".xml")){String name=f.getName().substring(0,f.getName().length()-4);android.content.SharedPreferences active=c.getSharedPreferences(name,0);Map<String,?> values=readPrefs(f);android.content.SharedPreferences.Editor edit=active.edit().clear();for(Map.Entry<String,?> e:values.entrySet()){Object v=e.getValue();if(v instanceof String)edit.putString(e.getKey(),(String)v);else if(v instanceof Boolean)edit.putBoolean(e.getKey(),(Boolean)v);else if(v instanceof Integer)edit.putInt(e.getKey(),(Integer)v);else if(v instanceof Long)edit.putLong(e.getKey(),(Long)v);else if(v instanceof Float)edit.putFloat(e.getKey(),(Float)v);else if(v instanceof Set)edit.putStringSet(e.getKey(),(Set<String>)v);}if(!edit.commit())throw new IOException("Profile settings restore failed");}}
   write(webState(c),read(new File(profile,"web-storage.json")));
  }else write(webState(c),new JSONObject());
  if(!request(c).delete())throw new IOException("Profile request cleanup failed");
 }
 private static Map<String,Object> readPrefs(File file)throws Exception{
  Map<String,Object> out=new HashMap<>();org.xmlpull.v1.XmlPullParser parser=android.util.Xml.newPullParser();try(InputStream in=new FileInputStream(file)){parser.setInput(in,"UTF-8");int event;String setName=null;Set<String> values=null;while((event=parser.next())!=org.xmlpull.v1.XmlPullParser.END_DOCUMENT){if(event==org.xmlpull.v1.XmlPullParser.START_TAG){String tag=parser.getName(),name=parser.getAttributeValue(null,"name"),value=parser.getAttributeValue(null,"value");if(tag.equals("set")){setName=name;values=new HashSet<>();}else if(tag.equals("string")){String text=parser.nextText();if(values!=null)values.add(text);else out.put(name,text);}else if(tag.equals("boolean"))out.put(name,Boolean.parseBoolean(value));else if(tag.equals("int"))out.put(name,Integer.parseInt(value));else if(tag.equals("long"))out.put(name,Long.parseLong(value));else if(tag.equals("float"))out.put(name,Float.parseFloat(value));}else if(event==org.xmlpull.v1.XmlPullParser.END_TAG&&parser.getName().equals("set")){out.put(setName,values);values=null;setName=null;}}}return out;
 }
 static JSONObject state(Context c)throws Exception{File f=webState(c);return f.isFile()?read(f):new JSONObject();}
 static void finishWeb(Context c)throws Exception{File f=webState(c);if(f.exists()&&!f.delete())throw new IOException("Profile display restore incomplete");}
}
