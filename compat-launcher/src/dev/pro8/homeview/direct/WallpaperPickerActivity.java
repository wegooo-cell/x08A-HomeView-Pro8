package dev.pro8.homeview.direct;
/** Android forwards the result directly to the original caller, including the selected URI grant. */
public final class WallpaperPickerActivity extends android.app.Activity {
 public void onCreate(android.os.Bundle state){super.onCreate(state);if(getCallingActivity()==null){finish();return;}try{startActivity(new android.content.Intent().setClassName("io.github.wegooo_cell.homeview","dev.pro8.homeview.direct.WallpaperPickerActivity").addFlags(android.content.Intent.FLAG_ACTIVITY_FORWARD_RESULT));}catch(android.content.ActivityNotFoundException e){android.widget.Toast.makeText(this,"请先安装 x08A HomeView Pro8",android.widget.Toast.LENGTH_LONG).show();}finish();}
}
