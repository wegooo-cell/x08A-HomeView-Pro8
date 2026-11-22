package dev.pro8.homeview.direct;
import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.graphics.*;
import android.media.ExifInterface;
import android.os.*;
import org.json.*;
import java.io.*;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.*;

/** Only Pictures/HomeView is scanned. Public originals, private optimized derivatives. */
final class AlbumFolder {
    final File directory;private final LocalAlbum album;private final Context context;private final ExecutorService worker=Executors.newSingleThreadExecutor();
    private volatile boolean busy,closed;private volatile long lastScan;private FileObserver observer;private volatile String error="";
    AlbumFolder(Context c,LocalAlbum album){this(c,album,new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES),"HomeView"));}
    AlbumFolder(Context c,LocalAlbum album,File directory){context=c.getApplicationContext();this.album=album;this.directory=directory;}
    boolean allowed(){return context.checkSelfPermission(Manifest.permission.READ_EXTERNAL_STORAGE)==PackageManager.PERMISSION_GRANTED&&context.checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE)==PackageManager.PERMISSION_GRANTED;}
    synchronized void refresh(){if(closed||busy||!allowed()||SystemClock.elapsedRealtime()-lastScan<2000)return;busy=true;worker.execute(()->{try{scan();error="";}catch(Exception e){error="图片目录暂时无法同步，请稍后重试";android.util.Log.w("HomeViewAlbum","Folder sync incomplete");}finally{lastScan=SystemClock.elapsedRealtime();busy=false;}});}
    JSONObject state()throws Exception{refresh();return new JSONObject().put("folder",directory.getAbsolutePath()).put("storage_ready",allowed()).put("scanning",busy).put("sync_error",error);}
    private void scan()throws Exception{
        if(java.nio.file.Files.isSymbolicLink(directory.toPath()))throw new IOException("Image folder is a link");
        if(!directory.isDirectory()&&!directory.mkdirs())throw new IOException("Image folder unavailable");
        synchronized(this){if(observer==null){observer=new FileObserver(directory.getAbsolutePath(),FileObserver.CLOSE_WRITE|FileObserver.MOVED_TO|FileObserver.MOVED_FROM|FileObserver.DELETE){public void onEvent(int event,String path){lastScan=0;refresh();}};observer.startWatching();}}
        // Copy existing imports once, without changing IDs, wallpaper links or originals.
        JSONArray initial; synchronized(album){initial=album.manifest();new AlbumSourceDeletion(directory,album.folder()).recover(initial);}
        for(int i=0;i<initial.length();i++){synchronized(album){JSONObject p=initial.optJSONObject(i);if(p==null||!p.optString("source").isEmpty())continue;String id=p.optString("id");if(!id.matches("import-[0-9a-f]{16}"))continue;if(!album.contains(id))continue;File privateImage=new File(album.folder(),id+"-1280.jpg"),target=new File(directory,id+".jpg");if(!privateImage.isFile())continue;if(target.exists()&&!same(privateImage,target))target=new File(directory,id+"-migrated-"+UUID.randomUUID().toString().substring(0,8)+".jpg");if(!target.exists())copy(privateImage,target);
            synchronized(album){JSONArray current=album.manifest();for(int j=0;j<current.length();j++){JSONObject x=current.optJSONObject(j);if(x!=null&&id.equals(x.optString("id"))&&x.optString("source").isEmpty()){x.put("source",target.getName()).put("source_mtime",target.lastModified()).put("source_size",target.length());album.saveManifest(current);break;}}}
        }}
        Map<String,JSONObject> bySource=new HashMap<>();synchronized(album){JSONArray current=album.manifest();for(int i=0;i<current.length();i++){JSONObject p=current.optJSONObject(i);if(p!=null&&!p.optString("source").isEmpty())bySource.put(p.optString("source"),p);}}
        File[] entries=directory.listFiles();if(entries==null)throw new IOException("Cannot read image folder");Arrays.sort(entries,(a,b)->a.getName().compareToIgnoreCase(b.getName()));
        for(File file:entries){if(closed)return;if(!image(file))continue;long stamp=file.lastModified(),size=file.length();if(size<=0||size>24L*1024*1024)continue;JSONObject previous=bySource.get(file.getName());
            if(previous!=null&&previous.optLong("source_mtime")==stamp&&previous.optLong("source_size")==size&&new File(album.folder(),previous.optString("id")+"-1280.jpg").isFile())continue;
            String id=previous!=null?previous.getString("id"):id(file.getName());JSONObject item;
            try{item=prepare(file,id);}catch(Exception e){continue;}
            synchronized(album){if(!file.isFile()||file.lastModified()!=stamp||file.length()!=size)continue;JSONArray current=album.manifest(),next=new JSONArray();for(int i=0;i<current.length();i++){JSONObject x=current.optJSONObject(i);if(x==null||!id.equals(x.optString("id")))next.put(current.get(i));}if(next.length()>=2000)throw new IOException("Image library is full");next.put(item.put("source",file.getName()).put("source_mtime",stamp).put("source_size",size).put("t",stamp/1000.0));album.saveManifest(next);}
        }
        // Keep derivative data for deleted sources so in-use wallpapers remain safe.
        synchronized(album){JSONArray current=album.manifest(),next=new JSONArray();boolean changed=false;for(int i=0;i<current.length();i++){JSONObject p=current.optJSONObject(i);if(p==null)continue;String source=p.optString("source");if(!source.isEmpty()&&!source(source).isFile()){changed=true;continue;}next.put(p);}if(changed)album.saveManifest(next);}
    }
    File source(String name)throws IOException{if(name.isEmpty()||name.contains("/")||name.contains("\\")||name.startsWith(".")||name.length()>240)throw new IOException("Invalid photo path");File f=new File(directory,name);if(!f.getCanonicalFile().getParentFile().equals(directory.getCanonicalFile())||java.nio.file.Files.isSymbolicLink(f.toPath()))throw new IOException("Invalid photo path");return f;}
    private boolean image(File f){try{String n=f.getName().toLowerCase(Locale.ROOT);return f.isFile()&&!f.getName().startsWith(".")&&n.matches(".*\\.(jpe?g|png|webp)")&&source(f.getName()).equals(f);}catch(IOException e){return false;}}
    static String id(String name)throws Exception{byte[] hash=MessageDigest.getInstance("SHA-256").digest(name.getBytes("UTF-8"));StringBuilder s=new StringBuilder("import-");for(int i=0;i<8;i++)s.append(String.format("%02x",hash[i]&255));return s.toString();}
    private static boolean same(File a,File b)throws Exception{if(a.length()!=b.length())return false;try(InputStream x=new FileInputStream(a);InputStream y=new FileInputStream(b)){byte[] l=new byte[8192],r=new byte[8192];int n;while((n=x.read(l))!=-1){int at=0,m;while(at<n&&(m=y.read(r,at,n-at))>0)at+=m;if(at!=n||!Arrays.equals(Arrays.copyOf(l,n),Arrays.copyOf(r,n)))return false;}return y.read()==-1;}}
    private static void copy(File a,File b)throws Exception{File temp=new File(b.getParentFile(),".homeview-copy-"+UUID.randomUUID());try{try(InputStream in=new FileInputStream(a);FileOutputStream out=new FileOutputStream(temp)){byte[] bytes=new byte[16384];int n;while((n=in.read(bytes))!=-1)out.write(bytes,0,n);out.getFD().sync();}if(b.exists()||!temp.renameTo(b))throw new IOException("Could not store photo");}finally{temp.delete();}}
    JSONObject prepare(File file,String id)throws Exception{
        BitmapFactory.Options opts=new BitmapFactory.Options();opts.inJustDecodeBounds=true;BitmapFactory.decodeFile(file.getAbsolutePath(),opts);int w=opts.outWidth,h=opts.outHeight;if(w<1||h<1||(long)w*h>100000000)throw new IOException("Image dimensions unsupported");opts.inSampleSize=1;while(Math.max(w,h)/opts.inSampleSize>2048)opts.inSampleSize*=2;opts.inJustDecodeBounds=false;opts.inPreferredConfig=Bitmap.Config.RGB_565;Bitmap image=BitmapFactory.decodeFile(file.getAbsolutePath(),opts);if(image==null)throw new IOException("Image unreadable");
        try{Matrix transform=new Matrix();try{int orientation=new ExifInterface(file.getAbsolutePath()).getAttributeInt(ExifInterface.TAG_ORIENTATION,ExifInterface.ORIENTATION_NORMAL);switch(orientation){case 2:transform.setScale(-1,1);break;case 3:transform.setRotate(180);break;case 4:transform.setScale(1,-1);break;case 5:transform.setRotate(90);transform.postScale(-1,1);break;case 6:transform.setRotate(90);break;case 7:transform.setRotate(270);transform.postScale(-1,1);break;case 8:transform.setRotate(270);break;}}catch(IOException ignored){}if(!transform.isIdentity()){Bitmap corrected=Bitmap.createBitmap(image,0,0,image.getWidth(),image.getHeight(),transform,true);if(corrected!=image){image.recycle();image=corrected;}}
            album.folder().mkdirs();for(int width:new int[]{1280,640,160}){float factor=Math.min(1,width/(float)Math.max(image.getWidth(),image.getHeight()));Bitmap scaled=Bitmap.createScaledBitmap(image,Math.max(1,Math.round(image.getWidth()*factor)),Math.max(1,Math.round(image.getHeight()*factor)),true);write(scaled,new File(album.folder(),id+"-"+width+".jpg"),Bitmap.CompressFormat.JPEG,86);if(scaled!=image)scaled.recycle();}
            Bitmap wall=Bitmap.createBitmap(1280,800,Bitmap.Config.RGB_565);Canvas canvas=new Canvas(wall);float scale=Math.max(1280f/image.getWidth(),800f/image.getHeight()),dw=image.getWidth()*scale,dh=image.getHeight()*scale;canvas.drawBitmap(image,null,new RectF((1280-dw)/2,(800-dh)/2,(1280+dw)/2,(800+dh)/2),new Paint(Paint.FILTER_BITMAP_FLAG));write(wall,new File(album.folder(),id+"-wall.webp"),Bitmap.CompressFormat.WEBP,85);Bitmap tiny=Bitmap.createScaledBitmap(wall,80,50,true),soft=Bitmap.createScaledBitmap(tiny,320,200,true);write(soft,new File(album.folder(),id+"-soft.webp"),Bitmap.CompressFormat.WEBP,75);tiny.recycle();soft.recycle();wall.recycle();return new JSONObject().put("id",id).put("w",w).put("h",h);
        }finally{image.recycle();}
    }
    private static void write(Bitmap image,File target,Bitmap.CompressFormat format,int quality)throws Exception{android.util.AtomicFile file=new android.util.AtomicFile(target);FileOutputStream out=null;try{out=file.startWrite();if(!image.compress(format,quality,out))throw new IOException("Could not encode photo");file.finishWrite(out);}catch(Exception e){if(out!=null)file.failWrite(out);throw e;}}
    void close(){closed=true;if(observer!=null)observer.stopWatching();worker.shutdownNow();}
}
