package dev.pro8.homeview.direct;

import android.app.Activity;
import android.content.*;
import android.content.res.Configuration;
import android.graphics.*;
import android.graphics.drawable.*;
import android.net.Uri;
import android.os.Bundle;
import android.util.LruCache;
import android.view.*;
import android.widget.*;
import org.json.JSONArray;
import java.io.InputStream;

/** Explicit user selection from HomeView's album. Returns only one temporary read grant. */
public final class WallpaperPickerActivity extends Activity {
    private JSONArray photos=new JSONArray();private LocalAlbum album;private Typeface font;
    private final LruCache<String,Bitmap> thumbs=new LruCache<>(16);
    @Override protected void attachBaseContext(Context base){Configuration c=new Configuration(base.getResources().getConfiguration());c.densityDpi=160;c.fontScale=1;super.attachBaseContext(base.createConfigurationContext(c));}
    @Override public void onCreate(Bundle state){super.onCreate(state);
        if(getCallingActivity()==null){finish();return;}
        album=new LocalAlbum(this);try{photos=album.items();}catch(Exception ignored){}
        font=Typeface.create("sans-serif",Typeface.NORMAL);
        getWindow().setFlags(1024,1024);getWindow().getDecorView().setSystemUiVisibility(5894);
        LinearLayout root=new LinearLayout(this);root.setOrientation(1);root.setPadding(44,28,44,36);
        try(InputStream in=getAssets().open("frame/hv/desktop/assets/default-wallpaper-soft.webp")){BitmapFactory.Options o=new BitmapFactory.Options();o.inSampleSize=2;root.setBackground(new BitmapDrawable(getResources(),BitmapFactory.decodeStream(in,null,o)));}catch(Exception ignored){root.setBackgroundColor(0xff3e526b);}
        LinearLayout header=new LinearLayout(this);header.setGravity(Gravity.CENTER_VERTICAL);
        TextView title=text("选择壁纸",30);header.addView(title,new LinearLayout.LayoutParams(0,62,1));
        TextView cancel=text("取消",21);cancel.setGravity(Gravity.CENTER);cancel.setBackground(glass());cancel.setPadding(24,0,24,0);cancel.setOnClickListener(v->finish());header.addView(cancel,new LinearLayout.LayoutParams(100,48));root.addView(header);
        TextView caption=text(photos.length()==0?"相册还没有图片":"选择一张图片作为壁纸",18);caption.setPadding(0,6,0,24);root.addView(caption);
        GridView grid=new GridView(this);grid.setNumColumns(4);grid.setHorizontalSpacing(18);grid.setVerticalSpacing(18);grid.setSelector(android.R.color.transparent);grid.setVerticalScrollBarEnabled(false);grid.setDefaultFocusHighlightEnabled(false);grid.setSoundEffectsEnabled(false);
        grid.setAdapter(new BaseAdapter(){public int getCount(){return photos.length();}public Object getItem(int p){return null;}public long getItemId(int p){return p;}
            public View getView(int p,View old,ViewGroup parent){ImageView v=old instanceof ImageView?(ImageView)old:new ImageView(WallpaperPickerActivity.this);v.setLayoutParams(new AbsListView.LayoutParams(-1,185));v.setScaleType(ImageView.ScaleType.CENTER_CROP);v.setBackground(glass());v.setClipToOutline(true);v.setContentDescription("选择第"+(p+1)+"张壁纸");v.setDefaultFocusHighlightEnabled(false);
                try{String id=photos.getJSONObject(p).getString("id");Bitmap b=thumbs.get(id);if(b==null){byte[] data=album.image(Uri.parse("http://localhost/api/frame/photo/"+id+".jpg?w=160"));b=BitmapFactory.decodeByteArray(data,0,data.length);if(b!=null)thumbs.put(id,b);}v.setImageBitmap(b);}catch(Exception ignored){v.setImageDrawable(null);}return v;}});
        grid.setOnItemClickListener((parent,v,p,id)->select(p));root.addView(grid,new LinearLayout.LayoutParams(-1,0,1));setContentView(root);
    }
    private void select(int position){try{String id=photos.getJSONObject(position).getString("id");Uri uri=Uri.parse("content://"+getPackageName()+".wallpaper/wallpaper/"+id);
        Intent result=new Intent().setDataAndType(uri,"image/jpeg").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);result.setClipData(ClipData.newRawUri("wallpaper",uri));setResult(RESULT_OK,result);finish();
    }catch(Exception ignored){Toast.makeText(this,"图片暂时无法读取",0).show();}}
    private TextView text(String value,int size){TextView v=new TextView(this);v.setText(value);v.setTextSize(android.util.TypedValue.COMPLEX_UNIT_PX,size);v.setTextColor(Color.WHITE);v.setTypeface(font);v.setGravity(Gravity.CENTER_VERTICAL);v.setDefaultFocusHighlightEnabled(false);v.setSoundEffectsEnabled(false);return v;}
    private GradientDrawable glass(){GradientDrawable d=new GradientDrawable();d.setColor(0x22ffffff);d.setCornerRadius(24);d.setStroke(1,0x55ffffff);return d;}
    @Override protected void onDestroy(){thumbs.evictAll();super.onDestroy();}
}
