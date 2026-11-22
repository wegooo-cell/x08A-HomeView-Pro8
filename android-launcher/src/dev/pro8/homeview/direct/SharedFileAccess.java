package dev.pro8.homeview.direct;

import java.io.File;
import java.io.IOException;
import java.util.Locale;

/** Canonical, read-only shared-storage boundary. Paths never come from a web request. */
final class SharedFileAccess {
    private final File root;
    SharedFileAccess(File directory) throws IOException { root=directory.getCanonicalFile(); }
    File root(){return root;}
    private static void check(String relative) throws IOException {
        if(relative==null||relative.length()>4096||relative.indexOf('\\')>=0||new File(relative).isAbsolute())throw new IOException("目录不可访问");
        if(relative.isEmpty())return;
        for(String part:relative.split("/",-1))if(part.isEmpty()||part.startsWith("."))throw new IOException("目录不可访问");
        String lower=relative.toLowerCase(Locale.ROOT);
        if(lower.equals("android/data")||lower.startsWith("android/data/")||lower.equals("android/obb")||lower.startsWith("android/obb/"))throw new IOException("应用专用目录不可访问");
    }
    File resolve(String relative) throws IOException {
        check(relative);File file=new File(root,relative).getCanonicalFile();String base=root.getPath(),path=file.getPath();
        if(!path.equals(base)&&!path.startsWith(base+File.separator))throw new IOException("目录不可访问");
        check(path.equals(base)?"":path.substring(base.length()+1));return file;
    }
}
