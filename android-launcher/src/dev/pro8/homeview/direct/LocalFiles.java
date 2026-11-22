package dev.pro8.homeview.direct;

import android.Manifest;
import android.content.*;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Environment;
import android.webkit.MimeTypeMap;
import java.io.*;
import java.util.*;
import org.json.*;

/** Read-only metadata for actual primary shared storage. Web clients use opaque handles. */
final class LocalFiles {
    static final String AUTHORITY="io.github.wegooo_cell.homeview.localfiles";
    private final Context context;
    private final File storage=Environment.getExternalStorageDirectory();
    private final LinkedHashMap<String,Node> nodes=new LinkedHashMap<>();
    private final LinkedHashSet<String> opened=new LinkedHashSet<>();
    private SharedFileAccess access;
    private static class Node {String token,parent,relative,name,mime;boolean directory;long size,modified;}
    private static class Entry {File file;String relative;boolean directory;Entry(File f,String p){file=f;relative=p;directory=f.isDirectory();}}
    LocalFiles(Context c){context=c.getApplicationContext();}
    boolean granted(){return context.checkSelfPermission(Manifest.permission.READ_EXTERNAL_STORAGE)==PackageManager.PERMISSION_GRANTED;}
    boolean asked(){return context.getSharedPreferences("homeview_files",0).getBoolean("read_permission_asked",false);}
    void markAsked(){context.getSharedPreferences("homeview_files",0).edit().putBoolean("read_permission_asked",true).apply();}
    private void ready() throws IOException {
        if(!granted())throw new SecurityException("请允许读取本机存储");
        String state=Environment.getExternalStorageState();if(!Environment.MEDIA_MOUNTED.equals(state)&&!Environment.MEDIA_MOUNTED_READ_ONLY.equals(state))throw new IOException("本机存储暂不可用");
        if(access!=null)return;access=new SharedFileAccess(storage);Node root=new Node();root.token="root";root.parent="";root.relative="";root.name="内部存储";root.directory=true;root.mime="inode/directory";nodes.put(root.token,root);
    }
    private Node node(String token)throws IOException {
        ready();Node n=nodes.get(token==null||token.isEmpty()?"root":token);if(n==null)throw new IOException("目录已刷新，请返回内部存储");access.resolve(n.relative);return n;
    }
    private static String mime(File file){String name=file.getName();int dot=name.lastIndexOf('.');String extension=dot<0?"":name.substring(dot+1).toLowerCase(Locale.ROOT);String type=MimeTypeMap.getSingleton().getMimeTypeFromExtension(extension);return type==null?"application/octet-stream":type;}
    private static boolean canOpen(Node n){String name=n.name.toLowerCase(Locale.ROOT),type=n.mime;return !n.directory&&!name.endsWith(".apk")&&!name.endsWith(".apks")&&!name.endsWith(".xapk")&&!"application/vnd.android.package-archive".equals(type)&&(type.startsWith("image/")||type.startsWith("audio/")||type.startsWith("video/")||type.startsWith("text/")||type.equals("application/pdf"));}
    synchronized JSONObject list(String token,int offset)throws Exception {
        if(!granted())return NetEaseClient.obj("ok",true,"configured",false,"permission_required",true,"auto_request",!asked(),"storage_path",storage.getAbsolutePath(),"items",new JSONArray());
        if(offset<0||offset>100000)throw new IllegalArgumentException("分页无效");
        Node parent=node(token);File folder=access.resolve(parent.relative);if(!folder.isDirectory())throw new IOException("请选择文件夹");
        File[] children=folder.listFiles();if(children==null)throw new IOException("无法读取此目录");
        ArrayList<Entry> entries=new ArrayList<>();
        for(File child:children){String relative=parent.relative.isEmpty()?child.getName():parent.relative+"/"+child.getName();try{File safe=access.resolve(relative);if(safe.isDirectory()||safe.isFile())entries.add(new Entry(safe,relative));}catch(IOException ignored){}}
        Collections.sort(entries,(a,b)->{if(a.directory!=b.directory)return a.directory?-1:1;int order=a.file.getName().compareToIgnoreCase(b.file.getName());return order!=0?order:a.relative.compareTo(b.relative);});
        JSONArray items=new JSONArray();int end=Math.min(entries.size(),offset+80);
        for(int i=offset;i<end;i++){Entry e=entries.get(i);Node n=null;for(Node previous:nodes.values())if(previous.relative.equals(e.relative)&&previous.parent.equals(parent.token)){n=previous;break;}
            if(n==null){n=new Node();n.token=UUID.randomUUID().toString();n.parent=parent.token;n.relative=e.relative;}
            n.name=e.file.getName();n.directory=e.directory;n.mime=e.directory?"inode/directory":mime(e.file);n.size=e.directory?-1:e.file.length();n.modified=e.file.lastModified();nodes.put(n.token,n);
            items.put(NetEaseClient.obj("id",n.token,"name",n.name,"directory",n.directory,"size",n.size,"modified",n.modified,"type",n.mime,"openable",n.directory||canOpen(n)));
        }
        HashSet<String> keep=new HashSet<>(opened);Node ancestor=parent;ArrayList<Node> chain=new ArrayList<>();while(ancestor!=null){keep.add(ancestor.token);chain.add(ancestor);ancestor=nodes.get(ancestor.parent);}
        for(int i=0;i<items.length();i++)keep.add(items.getJSONObject(i).getString("id"));if(nodes.size()>1024){Iterator<String> iterator=nodes.keySet().iterator();while(iterator.hasNext())if(!keep.contains(iterator.next()))iterator.remove();}
        Collections.reverse(chain);JSONArray crumbs=new JSONArray();for(Node n:chain)crumbs.put(NetEaseClient.obj("id",n.token,"name",n.name));
        return NetEaseClient.obj("ok",true,"configured",true,"permission_required",false,"storage_path",access.root().getPath(),"path",folder.getPath(),"id",parent.token,"name",parent.name,"parent",parent.parent,"breadcrumbs",crumbs,"items",items,"offset",offset,"next_offset",end,"has_more",end<entries.size());
    }
    private Node readable(String token)throws IOException {Node n=node(token);if(!canOpen(n)||!access.resolve(n.relative).isFile())throw new IOException("此文件仅供查看信息，暂不支持打开");return n;}
    synchronized File file(String token)throws IOException {return access.resolve(readable(token).relative);}
    synchronized String type(String token)throws IOException {return readable(token).mime;}
    synchronized String name(String token)throws IOException {return readable(token).name;}
    synchronized Intent open(String token)throws IOException {
        Node n=readable(token);opened.add(n.token);while(opened.size()>32)opened.remove(opened.iterator().next());Uri uri=Uri.parse("content://"+AUTHORITY+"/file/"+n.token);
        Intent intent=new Intent(Intent.ACTION_VIEW).setDataAndType(uri,n.mime).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);intent.setClipData(ClipData.newRawUri("文件",uri));return intent;
    }
}
