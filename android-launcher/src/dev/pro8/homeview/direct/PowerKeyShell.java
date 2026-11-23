package dev.pro8.homeview.direct;

import android.os.Build;
import android.os.Process;
import android.view.InputDevice;
import org.json.JSONArray;
import org.json.JSONObject;

/** USB shell entry. Uses shell's existing SET_KEYBOARD_LAYOUT grant, never grants it to the app. */
public final class PowerKeyShell {
    static final String LAYOUT="io.github.wegooo_cell.homeview/dev.pro8.homeview.direct.PowerKeyboardLayouts/pro8_power";
    private static Class<?> managerType,identifierType;
    private static Object manager,identifier;
    private static Object invoke(String name,Class<?>[] types,Object... args)throws Exception {
        return managerType.getMethod(name,types).invoke(manager,args);
    }
    private static String current()throws Exception {
        return (String)invoke("getCurrentKeyboardLayoutForInputDevice",new Class<?>[]{identifierType},identifier);
    }
    public static void main(String[] args) {
        JSONObject reply=new JSONObject();
        try {
            if(Process.myUid()!=2000||Build.VERSION.SDK_INT!=28||!(Build.MODEL.equals("X08A")||Build.MODEL.equals("Pro8")))throw new SecurityException("仅支持已授权 USB 调试的 Pro8 / Android 9");
            if(args.length<1)throw new IllegalArgumentException("缺少操作");
            managerType=Class.forName("android.hardware.input.InputManager");
            identifierType=Class.forName("android.hardware.input.InputDeviceIdentifier");
            manager=managerType.getMethod("getInstance").invoke(null);
            InputDevice found=null;
            for(int id:InputDevice.getDeviceIds()){
                InputDevice d=InputDevice.getDevice(id);
                if(d!=null&&"mtk-pmic-keys".equals(d.getName())&&d.getVendorId()==1&&d.getProductId()==1){
                    if(found!=null)throw new IllegalStateException("存在多个 PMIC 按键设备，已停止");found=d;
                }
            }
            if(found==null)throw new IllegalStateException("未检测到支持的 Pro8 背部按键");
            if(!Boolean.TRUE.equals(InputDevice.class.getMethod("isExternal").invoke(found)))throw new IllegalStateException("此固件按键唤醒策略不支持布局覆盖");
            identifier=InputDevice.class.getMethod("getIdentifier").invoke(found);
            String before=current();
            reply.put("device",found.getName()).put("descriptor",found.getDescriptor()).put("before",before==null?JSONObject.NULL:before);
            String[] enabled=(String[])invoke("getEnabledKeyboardLayoutsForInputDevice",new Class<?>[]{identifierType},identifier);
            reply.put("enabled_before",new JSONArray(enabled==null?new String[0]:enabled));
            if(args[0].equals("apply")){
                Object layout=invoke("getKeyboardLayout",new Class<?>[]{String.class},LAYOUT);
                if(layout==null)throw new IllegalStateException("HomeView 按键布局尚未注册，请重试");
                invoke("setCurrentKeyboardLayoutForInputDevice",new Class<?>[]{identifierType,String.class},identifier,LAYOUT);
            } else if(args[0].equals("restore")&&args.length==3&&(args[2].equals("keep")||args[2].equals("remove"))){
                // Only remove our own overlay; never replace another layout selected afterwards.
                if(!LAYOUT.equals(current()))throw new IllegalStateException("当前布局已更改，保留现状");
                if(!args[1].equals("none")){
                    if(invoke("getKeyboardLayout",new Class<?>[]{String.class},args[1])==null)throw new IllegalArgumentException("原布局已不可用");
                    invoke("setCurrentKeyboardLayoutForInputDevice",new Class<?>[]{identifierType,String.class},identifier,args[1]);
                }
                if(args[2].equals("remove"))invoke("removeKeyboardLayoutForInputDevice",new Class<?>[]{identifierType,String.class},identifier,LAYOUT);
            } else if(!args[0].equals("inspect"))throw new IllegalArgumentException("不支持的操作");
            String after=current();reply.put("current",after==null?JSONObject.NULL:after).put("ok",true);
        }catch(Exception e){try{reply.put("ok",false).put("error","无法配置按键布局（"+e.getClass().getSimpleName()+"），请检查设备系统支持和 USB 调试授权");}catch(Exception ignored){}}
        System.out.println(reply.toString());
        System.exit(reply.optBoolean("ok")?0:1);
    }
}
