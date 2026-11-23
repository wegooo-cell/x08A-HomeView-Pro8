package dev.pro8.homeview.direct;

import android.app.Activity;
import android.app.admin.DevicePolicyManager;
import android.content.ComponentName;
import android.content.Intent;
import android.os.Bundle;
import android.widget.TextView;
import java.io.File;
import org.json.JSONObject;

/** USB-only permission handoff. Activation is always confirmed in Android's own UI. */
public final class PowerKeySetupActivity extends Activity {
    private String name;
    private boolean active(){return new HomeKeyController(this).authorized();}
    private void result(String status){
        try {SetupImport.write(new File(SetupImport.folder(this),name),new JSONObject().put("status",status).put("authorized",active()));}
        catch(Exception ignored){}
    }
    @Override public void onCreate(Bundle state){
        super.onCreate(state);
        name=getIntent().getStringExtra("result_name");
        if(name==null||!name.matches("power-[a-f0-9]{32}\\.json")){finish();return;}
        TextView text=new TextView(this);text.setTextSize(24);text.setGravity(android.view.Gravity.CENTER);
        text.setText("单击切换桌面已配置\n双击熄屏需要确认系统锁屏授权");setContentView(text);
        getSharedPreferences("homeview_pro8",0).edit().putBoolean("double_home_sleep",true).commit();
        if(active()){result("authorized");finish();return;}
        if(state!=null)return;
        result("pending_authorization");
        Intent intent=new Intent(DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN)
            .putExtra(DevicePolicyManager.EXTRA_DEVICE_ADMIN,new ComponentName(this,HomeViewAdmin.class))
            .putExtra(DevicePolicyManager.EXTRA_ADD_EXPLANATION,"允许 HomeView 在双击背部按键时关闭屏幕。此权限只用于锁屏，可在系统设置中撤销。");
        try{startActivityForResult(intent,71);}catch(RuntimeException e){result("unavailable");text.setText("系统未提供锁屏授权页面。\n可稍后在 HomeView 连接设置中启用双击熄屏。");text.postDelayed(()->finish(),3500);}
    }
    @Override protected void onActivityResult(int request,int code,Intent data){
        super.onActivityResult(request,code,data);if(request==71){result(active()?"authorized":"declined");finish();}
    }
}
