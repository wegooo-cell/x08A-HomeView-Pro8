package dev.pro8.homeview.direct;

import android.animation.Animator;
import android.animation.AnimatorListenerAdapter;
import android.animation.ObjectAnimator;
import android.animation.Keyframe;
import android.animation.PropertyValuesHolder;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.app.Dialog;
import android.view.Gravity;
import android.view.WindowManager;
import android.graphics.Outline;
import android.graphics.Rect;
import android.os.Handler;
import android.os.SystemClock;
import android.view.Choreographer;
import android.view.View;
import android.view.ViewOutlineProvider;
import android.view.ViewTreeObserver;
import android.view.Window;
import android.view.PixelCopy;
import android.view.FrameMetrics;
import android.view.animation.PathInterpolator;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.widget.FrameLayout;
import android.widget.ImageView;
import java.util.ArrayList;
import java.util.UUID;
import org.json.JSONArray;
import org.json.JSONObject;

/** Two bounded, memory-only transition textures; never exports or saves pixels. */
final class NativeMotion {
    private final WebView web;
    private java.util.function.Consumer<Bitmap> snapshotSink;
    private LocalRecentApps recentApps;
    void recents(LocalRecentApps recent){recentApps=recent;snapshots(recent::snapshot);}
    void snapshots(java.util.function.Consumer<Bitmap> sink){snapshotSink=sink;}
    private void snapshot(Bitmap bitmap){if(snapshotSink!=null)try{snapshotSink.accept(bitmap);}catch(RuntimeException|OutOfMemoryError ignored){}}
    private final FrameLayout root;
    private final Window window;
    private final Handler ui=new Handler();
    private final String key=UUID.randomUUID().toString();
    private ImageView background,card;
    private FrameLayout surface;
    private Dialog overlay;
    private ViewTreeObserver.OnDrawListener pendingDraw;
    private long visualReadyMs;
    private Window sampleWindow;
    private Bitmap backBitmap,cardBitmap;
    private Bitmap homeBitmap;
    private ObjectAnimator animation;
    private int generation;
    private int homeCaptureSerial,homeCapturePending;
    private boolean sampling,renderListening;
    private long lastFrame,captureMs,backCaptureMs,frontCaptureMs;
    private final ArrayList<Double> frames=new ArrayList<>();
    private final ArrayList<Double> renderFrames=new ArrayList<>();
    private final Window.OnFrameMetricsAvailableListener renderSampler=(window,metrics,dropped)->{if(sampling&&renderFrames.size()<80)renderFrames.add(metrics.getMetric(FrameMetrics.TOTAL_DURATION)/1000000.0);};
    private volatile String lastStats="{}";
    private final Runnable timeout=()->abort(true);
    private final Choreographer.FrameCallback frameSampler=new Choreographer.FrameCallback(){
        @Override public void doFrame(long now){
            if(!sampling)return;
            if(lastFrame!=0&&frames.size()<80)frames.add((now-lastFrame)/1000000.0);
            lastFrame=now;Choreographer.getInstance().postFrameCallback(this);
        }
    };
    NativeMotion(WebView web,FrameLayout root,Window window){this.web=web;this.root=root;this.window=window;}
    void connect(){web.evaluateJavascript("if(window.HVNativeMotion)HVNativeMotion.connect("+JSONObject.quote(key)+");",null);}
    private boolean valid(String capability){return key.equals(capability);}
    private boolean local(){String url=web.getUrl();return url!=null&&url.startsWith(LocalWebServer.HOME);}
    private void reply(int id,String stage){web.evaluateJavascript("if(window.HVNativeMotion)HVNativeMotion.receive("+id+","+JSONObject.quote(stage)+");",null);}
    private ImageView image(Bitmap bitmap){
        ImageView v=new ImageView(web.getContext());v.setScaleType(ImageView.ScaleType.FIT_XY);v.setImageBitmap(bitmap);
        v.setClickable(false);v.setFocusable(false);v.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        ensureSurface();surface.addView(v,new FrameLayout.LayoutParams(-1,-1));return v;
    }
    private Bitmap bitmap(){
        int w=web.getWidth(),h=web.getHeight();if(w<=0||h<=0)throw new IllegalStateException();
        int bw=Math.min(800,w),bh=Math.max(1,Math.round((float)h*bw/w));
        return Bitmap.createBitmap(bw,bh,Bitmap.Config.ARGB_8888);
    }
    private void ensureSurface(){
        if(surface!=null)return;
        overlay=new Dialog(web.getContext());overlay.requestWindowFeature(Window.FEATURE_NO_TITLE);overlay.setCancelable(false);
        surface=new FrameLayout(web.getContext());overlay.setContentView(surface);
        Window pane=overlay.getWindow();pane.setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));pane.setWindowAnimations(0);
        pane.clearFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND);
        pane.addFlags(WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE|WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE|WindowManager.LayoutParams.FLAG_FULLSCREEN|WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN|WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED);
        pane.setTitle("HomeView Motion");pane.setGravity(Gravity.TOP|Gravity.LEFT);pane.getDecorView().setSystemUiVisibility(window.getDecorView().getSystemUiVisibility());
        overlay.show();pane.setLayout(root.getWidth(),root.getHeight());
    }
    private void readyAfterDraw(int id,String stage){
        FrameLayout current=surface;current.postOnAnimation(()->{if(generation==id)current.postOnAnimation(()->{if(generation==id)reply(id,stage);});});
    }
    // VisualStateCallback means the next draw can contain the DOM state; it
    // does not mean the window has submitted that draw to SurfaceFlinger yet.
    // Keep the transition surface until a real WebView draw and two vsyncs.
    private void afterWebDraw(int id,Runnable complete){
        web.postVisualStateCallback(id,new WebView.VisualStateCallback(){
            @Override public void onComplete(long request){
                if(generation!=id)return;
                removeDrawWait();
                pendingDraw=new ViewTreeObserver.OnDrawListener(){boolean fired;
                    @Override public void onDraw(){
                        if(fired)return;fired=true;
                        web.post(()->{
                            if(generation!=id)return;removeDrawWait();
                            web.postOnAnimation(()->{if(generation==id)web.postOnAnimation(()->{if(generation==id){visualReadyMs=SystemClock.uptimeMillis();complete.run();}});});
                        });
                    }
                };
                web.getViewTreeObserver().addOnDrawListener(pendingDraw);
                web.invalidate();
            }
        });
    }
    private void removeDrawWait(){
        if(pendingDraw!=null&&web.getViewTreeObserver().isAlive())web.getViewTreeObserver().removeOnDrawListener(pendingDraw);
        pendingDraw=null;
    }
    private void deadline(){ui.removeCallbacks(timeout);ui.postDelayed(timeout,1800);}
    @JavascriptInterface public void cacheHome(String capability){if(!valid(capability))return;ui.post(()->{
        if(!local()||generation!=0||homeCapturePending!=0||web.getVisibility()!=View.VISIBLE)return;
        final int serial=++homeCaptureSerial;homeCapturePending=serial;
        try{
            Bitmap b=bitmap();int[] xy=new int[2];web.getLocationInWindow(xy);
            PixelCopy.request(window,new Rect(xy[0],xy[1],xy[0]+web.getWidth(),xy[1]+web.getHeight()),b,result->{
                if(homeCapturePending==serial)homeCapturePending=0;
                if(result!=PixelCopy.SUCCESS||generation!=0||serial!=homeCaptureSerial){b.recycle();return;}
                if(homeBitmap!=null)homeBitmap.recycle();homeBitmap=b;
            },ui);
        }catch(RuntimeException|OutOfMemoryError ignored){if(homeCapturePending==serial)homeCapturePending=0;}
    });}
    @JavascriptInterface public void prepare(String capability,int id,boolean opening){if(!valid(capability)||id<=0)return;ui.post(()->{
        if(!local()){reply(id,"fail");return;}abort(false);generation=id;if(opening&&homeBitmap!=null){homeBitmap.recycle();homeBitmap=null;}long start=SystemClock.uptimeMillis();captureMs=0;backCaptureMs=0;frontCaptureMs=0;deadline();
        try{
            // Read the already composed window: no software reraster of the desktop.
            Bitmap b=bitmap();int[] xy=new int[2];web.getLocationInWindow(xy);
            PixelCopy.request(window,new Rect(xy[0],xy[1],xy[0]+web.getWidth(),xy[1]+web.getHeight()),b,result->{
                if(id!=generation){b.recycle();return;}
                if(result!=PixelCopy.SUCCESS){b.recycle();abort(false);reply(id,"fail");return;}
                captureMs=SystemClock.uptimeMillis()-start;
                if(opening){backCaptureMs=captureMs;backBitmap=b;background=image(b);}
                else{snapshot(b);frontCaptureMs=captureMs;cardBitmap=b;if(homeBitmap!=null)background=image(homeBitmap);card=image(cardBitmap);configureCard();}
                deadline();readyAfterDraw(id,opening?"background":"ready");
            },ui);
        }catch(RuntimeException|OutOfMemoryError e){abort(false);reply(id,"fail");}
    });}
    private void configureCard(){
        card.setLayoutParams(new FrameLayout.LayoutParams(root.getWidth(),root.getHeight()));card.setPivotX(0);card.setPivotY(0);
        card.setOutlineProvider(new ViewOutlineProvider(){@Override public void getOutline(View v,Outline o){o.setRoundRect(0,0,v.getWidth(),v.getHeight(),20f);}});
        card.setClipToOutline(true);
    }
    @JavascriptInterface public void capture(String capability,int id){if(!valid(capability))return;ui.post(()->{
        if(id!=generation||background==null||!local())return;long start=SystemClock.uptimeMillis();deadline();
        afterWebDraw(id,()->{try{
            // The transition dialog owns a separate surface. Copy the real app
            // window behind it directly, without a software WebView.draw pass.
            Bitmap b=bitmap();int[] xy=new int[2];web.getLocationInWindow(xy);
            PixelCopy.request(window,new Rect(xy[0],xy[1],xy[0]+web.getWidth(),xy[1]+web.getHeight()),b,result->{
                if(id!=generation){b.recycle();return;}
                if(result!=PixelCopy.SUCCESS){b.recycle();abort(false);reply(id,"fail");return;}
                snapshot(b);cardBitmap=b;card=image(cardBitmap);configureCard();card.setAlpha(.001f);
                frontCaptureMs=SystemClock.uptimeMillis()-start;captureMs+=frontCaptureMs;deadline();readyAfterDraw(id,"ready");
            },ui);
        }catch(RuntimeException|OutOfMemoryError e){abort(false);reply(id,"fail");}});
    });}
    private float bound(double n,float lo,float hi){return Double.isNaN(n)||Double.isInfinite(n)?lo:Math.max(lo,Math.min(hi,(float)n));}
    private void pose(double x,double y,double sx,double sy,double alpha){
        card.setTranslationX(bound(x,-1280,1280)*root.getWidth()/1280f);card.setTranslationY(bound(y,-800,800)*root.getHeight()/800f);
        card.setScaleX(bound(sx,.02f,1.2f));card.setScaleY(bound(sy,.02f,1.2f));card.setAlpha(bound(alpha,0,1));
    }
    @JavascriptInterface public void move(String capability,int id,double x,double y,double sx,double sy,double alpha){if(!valid(capability))return;ui.post(()->{if(id==generation&&card!=null&&animation==null){pose(x,y,sx,sy,alpha);deadline();}});}
    @JavascriptInterface public void finish(String capability,int id,double x,double y,double sx,double sy,double alpha,int duration){finishTransition(capability,id,x,y,sx,sy,alpha,duration,false);}
    @JavascriptInterface public void dissolve(String capability,int id,double x,double y,double alpha){finishTransition(capability,id,x,y,1,1,alpha,220,true);}
    private void finishTransition(String capability,int id,double x,double y,double sx,double sy,double alpha,int duration,boolean dissolve){if(!valid(capability))return;ui.post(()->{
        if(id!=generation||card==null)return;stopAnimation();deadline();
        if(background!=null)web.setVisibility(View.INVISIBLE);
        animation=ObjectAnimator.ofPropertyValuesHolder(card,
            PropertyValuesHolder.ofFloat(View.TRANSLATION_X,bound(x,-1280,1280)*root.getWidth()/1280f),
            PropertyValuesHolder.ofFloat(View.TRANSLATION_Y,bound(y,-800,800)*root.getHeight()/800f),
            PropertyValuesHolder.ofFloat(View.SCALE_X,bound(sx,.02f,1.2f)),PropertyValuesHolder.ofFloat(View.SCALE_Y,bound(sy,.02f,1.2f)),
            PropertyValuesHolder.ofKeyframe(View.ALPHA,Keyframe.ofFloat(0,card.getAlpha()),Keyframe.ofFloat(.82f,card.getAlpha()),Keyframe.ofFloat(1,bound(alpha,0,1))));
        animation.setDuration(Math.max(120,Math.min(500,duration)));
        if(dissolve){
            animation.setValues(PropertyValuesHolder.ofFloat(View.TRANSLATION_X,bound(x,-1280,1280)*root.getWidth()/1280f),
                PropertyValuesHolder.ofFloat(View.TRANSLATION_Y,bound(y,-800,800)*root.getHeight()/800f),PropertyValuesHolder.ofFloat(View.ALPHA,bound(alpha,0,1)));
        }
        // Cubic ease-out: fast at release, gently slowing into the icon.
        // Same 1-(1-t)^3 curve as the lightweight WebView transitions.
        animation.setInterpolator(new PathInterpolator(1f/3f,1f,2f/3f,1f));
        frames.clear();renderFrames.clear();lastFrame=0;sampling=true;Choreographer.getInstance().postFrameCallback(frameSampler);sampleWindow=overlay.getWindow();sampleWindow.addOnFrameMetricsAvailableListener(renderSampler,ui);renderListening=true;
        animation.addListener(new AnimatorListenerAdapter(){boolean cancelled;
            @Override public void onAnimationCancel(Animator a){cancelled=true;}
            @Override public void onAnimationEnd(Animator a){
                if(cancelled||id!=generation)return;sampling=false;Choreographer.getInstance().removeFrameCallback(frameSampler);if(renderListening){sampleWindow.removeOnFrameMetricsAvailableListener(renderSampler);renderListening=false;}animation=null;
                try{lastStats=new JSONObject().put("generation",id).put("capture_ms",captureMs).put("background_capture_ms",backCaptureMs).put("foreground_capture_ms",frontCaptureMs).put("intervals_ms",new JSONArray(frames)).put("render_frame_ms",new JSONArray(renderFrames)).put("texture_width",cardBitmap.getWidth()).put("texture_height",cardBitmap.getHeight()).put("max_texture_bytes",(backBitmap==null?0:backBitmap.getAllocationByteCount())+(homeBitmap==null?0:homeBitmap.getAllocationByteCount())+cardBitmap.getAllocationByteCount()).toString();}catch(Exception ignored){}
                reply(id,"done");
            }
        });animation.start();
    });}
    @JavascriptInterface public void release(String capability,int id,boolean keepHome){if(!valid(capability))return;ui.post(()->{
        if(id!=generation)return;
        web.setVisibility(View.VISIBLE);deadline();
        afterWebDraw(id,()->{
            if(keepHome&&backBitmap!=null){if(homeBitmap!=null)homeBitmap.recycle();homeBitmap=backBitmap;backBitmap=null;}
            else if(!keepHome&&homeBitmap!=null){homeBitmap.recycle();homeBitmap=null;}
            abort(false);
        });
    });}
    @JavascriptInterface public String recentState(String capability){if(!valid(capability)||recentApps==null)return "{\"ok\":false}";try{return recentApps.state().toString();}catch(Exception e){return "{\"ok\":false,\"error\":\"暂时无法读取后台应用\"}";}}
    @JavascriptInterface public String closeRecent(String capability,String id){if(!valid(capability)||recentApps==null)return "{\"ok\":false}";try{return recentApps.close(id).toString();}catch(Exception e){try{return NetEaseClient.obj("ok",false,"error",e instanceof IllegalArgumentException?e.getMessage():"关闭未成功，请重试").toString();}catch(Exception ignored){return "{\"ok\":false}";}}}
    @JavascriptInterface public String stats(String capability){return valid(capability)?lastStats:"{}";}
    private void stopAnimation(){sampling=false;Choreographer.getInstance().removeFrameCallback(frameSampler);if(renderListening){sampleWindow.removeOnFrameMetricsAvailableListener(renderSampler);renderListening=false;}if(animation!=null){ObjectAnimator a=animation;animation=null;a.cancel();}}
    private void remove(ImageView v){if(v!=null){v.setImageDrawable(null);if(v.getParent() instanceof android.view.ViewGroup)((android.view.ViewGroup)v.getParent()).removeView(v);}}
    private void abort(boolean notify){int id=generation;generation=0;++homeCaptureSerial;homeCapturePending=0;removeDrawWait();ui.removeCallbacks(timeout);stopAnimation();web.setVisibility(View.VISIBLE);remove(card);remove(background);card=null;background=null;if(overlay!=null){overlay.dismiss();overlay=null;surface=null;}
        if(cardBitmap!=null){cardBitmap.recycle();cardBitmap=null;}if(backBitmap!=null){backBitmap.recycle();backBitmap=null;}if(notify&&id>0)reply(id,"fail");}
    void cancel(){abort(true);}
    void trimMemory(){if(generation!=0)return;++homeCaptureSerial;homeCapturePending=0;if(homeBitmap!=null){homeBitmap.recycle();homeBitmap=null;}}
    void destroy(){abort(false);if(homeBitmap!=null){homeBitmap.recycle();homeBitmap=null;}web.removeJavascriptInterface("HomeViewMotion");}
}
