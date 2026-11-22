package dev.pro8.homeview.direct;
import android.content.*;import android.database.*;import android.net.Uri;import android.os.ParcelFileDescriptor;import android.provider.OpenableColumns;import java.io.*;
/** Non-exported provider. Android grants read access only to the user's selected URI. */
public final class WallpaperProvider extends ContentProvider {
 public boolean onCreate(){return true;}
 private File image(Uri uri)throws FileNotFoundException{
  String path=uri.getPath();if(path==null||!path.matches("/wallpaper/import-[0-9a-f]{16}"))throw new FileNotFoundException();String id=path.substring(11);
  try{if(!new LocalAlbum(getContext()).contains(id))throw new FileNotFoundException();}catch(Exception e){throw new FileNotFoundException();}
  File f=new File(new File(getContext().getFilesDir(),"homeview-album"),id+"-1280.jpg");if(!f.isFile())throw new FileNotFoundException();return f;
 }
 public ParcelFileDescriptor openFile(Uri uri,String mode)throws FileNotFoundException{if(!"r".equals(mode))throw new FileNotFoundException("Read only");return ParcelFileDescriptor.open(image(uri),ParcelFileDescriptor.MODE_READ_ONLY);}
 public String getType(Uri uri){return "image/jpeg";}
 public Cursor query(Uri uri,String[] projection,String selection,String[] args,String sort){try{File f=image(uri);MatrixCursor c=new MatrixCursor(new String[]{OpenableColumns.DISPLAY_NAME,OpenableColumns.SIZE});c.addRow(new Object[]{"wallpaper.jpg",f.length()});return c;}catch(Exception e){return null;}}
 public Uri insert(Uri u,ContentValues v){throw new UnsupportedOperationException();}public int update(Uri u,ContentValues v,String s,String[] a){throw new UnsupportedOperationException();}public int delete(Uri u,String s,String[] a){throw new UnsupportedOperationException();}
}
