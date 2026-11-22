package dev.pro8.homeview.direct;

import android.app.Activity;
import android.graphics.Color;
import android.graphics.Rect;
import android.graphics.drawable.ColorDrawable;
import android.view.Gravity;
import android.view.View;
import android.view.ViewTreeObserver;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.widget.PopupWindow;

/** Non-focusable transparent measure window: fullscreen WebView 72 reports no IME insets. */
final class KeyboardInsets {
    private final Activity activity;private final WebView web;private final View content;private final PopupWindow probe;
    private int last=-1;private boolean requested,closed;
    KeyboardInsets(Activity a,WebView w){activity=a;web=w;content=new View(a);content.setBackgroundColor(Color.TRANSPARENT);
        probe=new PopupWindow(content,1,WindowManager.LayoutParams.MATCH_PARENT,false);probe.setTouchable(false);probe.setOutsideTouchable(false);probe.setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));probe.setInputMethodMode(PopupWindow.INPUT_METHOD_NEEDED);probe.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);probe.setElevation(0);
        content.getViewTreeObserver().addOnGlobalLayoutListener(new ViewTreeObserver.OnGlobalLayoutListener(){public void onGlobalLayout(){publish(false);}});
    }
    @JavascriptInterface public void watch(final boolean on){activity.runOnUiThread(new Runnable(){public void run(){if(closed)return;requested=on;if(on){if(!probe.isShowing()&&web.getWindowToken()!=null)probe.showAtLocation(web,Gravity.NO_GRAVITY,0,0);publish(true);}else{if(probe.isShowing())probe.dismiss();send(0,true);}}});}
    void publish(boolean force){if(closed||!requested||!probe.isShowing())return;Rect rect=new Rect();content.getWindowVisibleDisplayFrame(rect);int full=web.getRootView().getHeight();if(full<=0)return;int pixels=Math.max(0,full-rect.bottom);int height=pixels<120?0:Math.min(650,Math.round(pixels*800f/full));send(height,force);}
    private void send(int h,boolean force){if(h==last&&!force)return;last=h;web.evaluateJavascript("if(window.HVDesktopHost)HVDesktopHost.keyboard("+h+");",null);}
    void destroy(){closed=true;requested=false;if(probe.isShowing())probe.dismiss();}
}
