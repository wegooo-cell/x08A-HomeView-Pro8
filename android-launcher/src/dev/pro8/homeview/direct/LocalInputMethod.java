package dev.pro8.homeview.direct;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.content.Intent;
import android.provider.Settings;
import android.view.inputmethod.InputMethodInfo;
import android.view.inputmethod.InputMethodManager;
import android.widget.Toast;
import org.json.JSONObject;

/** Observe system keyboard selection; enabling and selection use Android's own UI. */
final class LocalInputMethod {
    private static final String FCITX="org.fcitx.fcitx5.android";
    static JSONObject state(Context c)throws Exception{
        InputMethodManager manager=(InputMethodManager)c.getSystemService(Context.INPUT_METHOD_SERVICE);
        String selected=Settings.Secure.getString(c.getContentResolver(),Settings.Secure.DEFAULT_INPUT_METHOD);
        boolean installed=false,enabled=false,ready=false,fcitxSelected=false;String name="";
        if(manager!=null){
            for(InputMethodInfo info:manager.getInputMethodList())if(FCITX.equals(info.getPackageName()))installed=true;
            for(InputMethodInfo info:manager.getEnabledInputMethodList()){
                if(FCITX.equals(info.getPackageName()))enabled=true;
                if(info.getId().equals(selected)){ready=true;fcitxSelected=FCITX.equals(info.getPackageName());name=String.valueOf(info.loadLabel(c.getPackageManager()));}
            }
        }
        return new JSONObject().put("ready",ready).put("name",name).put("fcitx_installed",installed).put("fcitx_enabled",enabled).put("fcitx_selected",fcitxSelected);
    }
    static boolean ready(Context c){try{return state(c).optBoolean("ready");}catch(Exception e){return true;}}
    static void show(Activity a){
        JSONObject status;try{status=state(a);}catch(Exception e){status=new JSONObject();}
        String message=status.optBoolean("ready")?"当前输入法："+status.optString("name")+"。点击输入框时系统会自动启动输入法。":"尚未选择可用的默认输入法。请先启用一个输入法，再选择为默认，即可在搜索和设置中输入文字。";
        message+="\nHomeView 保留系统输入法，小企鹅可按需选择。";
        AlertDialog.Builder dialog=new AlertDialog.Builder(a).setTitle("输入法设置").setMessage(message)
            .setNegativeButton("返回",null).setPositiveButton("选择输入法",(d,w)->{InputMethodManager m=(InputMethodManager)a.getSystemService(Context.INPUT_METHOD_SERVICE);if(m!=null)m.showInputMethodPicker();});
        dialog.setNeutralButton("启用输入法",(d,w)->{try{Intent intent=new Intent(Settings.ACTION_INPUT_METHOD_SETTINGS);if(intent.resolveActivity(a.getPackageManager())==null)intent=new Intent(Settings.ACTION_SETTINGS);a.startActivity(intent);a.overridePendingTransition(0,0);}catch(Exception e){Toast.makeText(a,"请在系统设置中启用输入法",Toast.LENGTH_LONG).show();}}).show();
    }
}
