package dev.pro8.homeview.direct;

import android.content.*;
import android.database.*;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import java.io.*;

/** Non-exported provider grants access only to a file the user explicitly opens. */
public final class LocalFileProvider extends ContentProvider {
    public boolean onCreate(){return true;}
    private LocalFiles files(){return ((HomeViewApplication)getContext().getApplicationContext()).files();}
    private String token(Uri uri)throws FileNotFoundException {if(!"content".equals(uri.getScheme())||!LocalFiles.AUTHORITY.equals(uri.getAuthority())||uri.getPathSegments().size()!=2||!"file".equals(uri.getPathSegments().get(0))||!uri.getPathSegments().get(1).matches("[a-f0-9-]{36}"))throw new FileNotFoundException("文件不可读取");return uri.getPathSegments().get(1);}
    public String getType(Uri uri){try{return files().type(token(uri));}catch(Exception e){return "application/octet-stream";}}
    public Cursor query(Uri uri,String[] projection,String selection,String[] args,String sort){try{String id=token(uri);String[] columns=projection==null?new String[]{OpenableColumns.DISPLAY_NAME,OpenableColumns.SIZE}:projection;MatrixCursor cursor=new MatrixCursor(columns);Object[] row=new Object[columns.length];for(int i=0;i<columns.length;i++){if(OpenableColumns.DISPLAY_NAME.equals(columns[i]))row[i]=files().name(id);else if(OpenableColumns.SIZE.equals(columns[i]))row[i]=files().file(id).length();}cursor.addRow(row);return cursor;}catch(Exception e){throw new IllegalArgumentException("文件不可读取");}}
    public ParcelFileDescriptor openFile(Uri uri,String mode)throws FileNotFoundException {if(!"r".equals(mode))throw new FileNotFoundException("文件仅允许读取");try{return ParcelFileDescriptor.open(files().file(token(uri)),ParcelFileDescriptor.MODE_READ_ONLY);}catch(Exception e){throw new FileNotFoundException("文件不可读取");}}
    public Uri insert(Uri u,ContentValues values){throw new UnsupportedOperationException("只读文件");}
    public int update(Uri u,ContentValues v,String s,String[] a){throw new UnsupportedOperationException("只读文件");}
    public int delete(Uri u,String s,String[] a){throw new UnsupportedOperationException("只读文件");}
}
