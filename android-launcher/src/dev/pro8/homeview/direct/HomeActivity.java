package dev.pro8.homeview.direct;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.Context;
import android.content.DialogInterface;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.widget.CheckBox;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import android.provider.Settings;
import android.text.InputType;
import android.view.View;
import android.webkit.WebResourceError;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.FrameLayout;
import android.widget.TextView;
import android.widget.Toast;

public final class HomeActivity extends Activity {
    private static final String PREFS = "homeview_pro8";
    private static final String SERVER = "server_url";
    private static final String HA = "ha_url";
    static final String DEFAULT_HA="";
    static final String DEFAULT_SERVER = "";
    private static final String OFFLINE = "file:///android_asset/offline.html";
    private WebView webView;
    private final Runnable localRefresh=new Runnable(){@Override public void run(){runOnUiThread(new Runnable(){@Override public void run(){notifyLocalRefresh();}});}};
    private final Runnable widgetRefresh=new Runnable(){public void run(){if(webView!=null)webView.evaluateJavascript("document.dispatchEvent(new Event('hv-bilibili-refresh'));",null);}};
    private NativeMotion motion;private KeyboardInsets keyboardInsets;
    private boolean showingOffline;
    private boolean inputSetupOffered;
    private LocalVendor vendor;
    private volatile boolean foreground;
    private long lastDesktopSwitch;private int mijiaLaunchEpoch;
    private volatile int vendorEpoch;
    private final Handler vendorHandler = new Handler();
    private final ExecutorService vendorWorker = Executors.newSingleThreadExecutor();
    private final Runnable suspendVendor = new Runnable() {
        @Override public void run() {
            if (!foreground || !prefs().getBoolean("vendor_suspend", true) || !vendor.available()) return;
            final int epoch = vendorEpoch;
            vendorWorker.execute(new Runnable() {
                @Override public void run() {
                    if (!foreground || epoch != vendorEpoch) return;
                    try { vendor.hidden(true); }
                    catch (RuntimeException e) { android.util.Log.w("HomeViewVendor", "小爱后台关闭未完成"); }
                }
            });
        }
    };

    private void scheduleVendorSuspend() {
        vendorHandler.removeCallbacks(suspendVendor);
        if (foreground) vendorHandler.postDelayed(suspendVendor, 1000);
    }

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        vendor = new LocalVendor(this);
        if(!prefs().getBoolean("ha_setup_v41",false)){android.content.SharedPreferences.Editor edit=prefs().edit().putBoolean("ha_setup_v41",true);if(prefs().getString(HA,"").isEmpty())edit.putString(HA,DEFAULT_HA);edit.apply();}
        if (!prefs().contains("vendor_local_v1")) prefs().edit().putBoolean("vendor_local_v1", true).putBoolean("vendor_suspend", true).apply();
        getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON |
            android.view.WindowManager.LayoutParams.FLAG_FULLSCREEN);
        immersive();
        boolean debugWebView = getIntent().getBooleanExtra("pro8_debug", false);
        getIntent().removeExtra("pro8_debug");
        try{webView = new WebView(this);}catch(RuntimeException error){showRecovery();((HomeViewApplication)getApplication()).installedApps().watch(localRefresh);((HomeViewApplication)getApplication()).bilibiliWidget().watch(widgetRefresh);return;}
        // Request debugging only for explicit development launches. WebView 72
        // ignores this public switch on non-user Android builds (including this Pro8).
        WebView.setWebContentsDebuggingEnabled(debugWebView);
        // Immutable packaged assets can be reused by the two hosted app frames.
        // Only the HTTP resource cache is cleared on an APK upgrade, never cookies or storage.
        try {
            int revision=getPackageManager().getPackageInfo(getPackageName(),0).versionCode;
            if(prefs().getInt("asset_cache_version",-1)!=revision){webView.clearCache(true);prefs().edit().putInt("asset_cache_version",revision).apply();}
        } catch(android.content.pm.PackageManager.NameNotFoundException ignored) {}
        webView.setDefaultFocusHighlightEnabled(false);
        webView.setBackgroundColor(Color.BLACK);
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setUserAgentString(settings.getUserAgentString() + " Pro8HomeView/1");
        webView.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return route(url);
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return route(request.getUrl().toString());
            }
            @Override public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                if(view==webView)showRecovery();return true;
            }
            @Override public void onReceivedHttpError(WebView view, WebResourceRequest request, android.webkit.WebResourceResponse response){
                if(request.isForMainFrame()&&response.getStatusCode()>=400)offline();
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) offline();
            }
            @Override public void onReceivedError(WebView view, int code, String description, String failingUrl) {
                if (android.os.Build.VERSION.SDK_INT < 23) offline();
            }
            @Override public void onPageFinished(WebView view, String url) {
                if(view!=webView)return;
                showingOffline = OFFLINE.equals(url);
                if(!showingOffline&&LocalFirstRun.webState(HomeActivity.this).isFile()){
                    view.evaluateJavascript("document.documentElement.style.visibility='hidden';fetch('/api/hv/profile-web-state').then(function(r){return r.json()}).then(function(data){localStorage.clear();Object.keys(data).forEach(function(k){localStorage.setItem(k,String(data[k]));});return fetch('/api/hv/profile-web-state',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});}).then(function(){location.reload();}).catch(function(){document.documentElement.style.visibility='';});",null);return;
                }
                if(!showingOffline&&localPage(url)){try{String patch=SetupImport.webScript(HomeActivity.this);if(patch!=null){view.evaluateJavascript(patch,value->{boolean ok="true".equals(value);SetupImport.finishWeb(HomeActivity.this,ok);if(ok)view.reload();});return;}}catch(Exception ignored){SetupImport.finishWeb(HomeActivity.this,false);}}
                if(!showingOffline && motion!=null && url.startsWith(homeUrl()))motion.connect();
                if(!showingOffline&&!inputSetupOffered){inputSetupOffered=true;webView.postDelayed(()->{if(foreground&&!isFinishing()&&!LocalInputMethod.ready(HomeActivity.this))LocalInputMethod.show(HomeActivity.this);},600);}
                if(!showingOffline)view.evaluateJavascript("if(window.HVDesktopHost)HVDesktopHost.setForeground("+foreground+");",null);
                if(!showingOffline&&getIntent().hasExtra("homeview_silent"))openSilentIntent(getIntent());
                if(!showingOffline&&getIntent().getBooleanExtra("homeview_vinyl",false))openVinylIntent(getIntent());
                if(!showingOffline&&(getIntent().getBooleanExtra("homeview_timer",false)||getIntent().getBooleanExtra("homeview_alarm",false)))openClockIntent(getIntent());
            }
        });
        FrameLayout surface=new FrameLayout(this);
        surface.addView(webView,new FrameLayout.LayoutParams(-1,-1));
        motion=new NativeMotion(webView,surface,getWindow());
        LocalRecentApps recent=((HomeViewApplication)getApplication()).recentApps();motion.recents(recent);webView.addJavascriptInterface(recent,"HomeViewRecentApps");
        webView.addJavascriptInterface(motion,"HomeViewMotion");
        setContentView(surface);
        keyboardInsets=new KeyboardInsets(this,webView);webView.addJavascriptInterface(keyboardInsets,"HomeViewInput");
        openHome();
        ((HomeViewApplication)getApplication()).installedApps().watch(localRefresh);((HomeViewApplication)getApplication()).bilibiliWidget().watch(widgetRefresh);
    }

    private SharedPreferences prefs() { return getSharedPreferences(PREFS, MODE_PRIVATE); }

    private String homeUrl() { return LocalWebServer.HOME; }

    static Intent homeIntent(Context context) {
        return new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME)
            .setClass(context, HomeActivity.class).putExtra("homeview_return",true)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
    }

    private String normalize(String url) {
        url = url == null ? "" : url.trim();
        if (url.length() == 0) return DEFAULT_SERVER;
        if (!url.endsWith("/")) url += "/";
        if (!url.contains("/frame/hv/")) url += "frame/hv/";
        return url;
    }

    private boolean trusted(String url) {
        try {
            Uri requested = Uri.parse(url);
            Uri server = Uri.parse(homeUrl());
            if (requested.getScheme() == null || requested.getHost() == null) return false;
            if (requested.getHost().equals(server.getHost()) && requested.getPort() == server.getPort()) return true;
            String ha = prefs().getString(HA, DEFAULT_HA);
            if (ha.length() > 0) {
                Uri dashboard = Uri.parse(ha);
                return requested.getHost().equals(dashboard.getHost()) && requested.getPort() == dashboard.getPort();
            }
        } catch (Exception ignored) { }
        return false;
    }

    private boolean localPage(String url){try{Uri u=Uri.parse(url);return "http".equals(u.getScheme())&&"127.0.0.1".equals(u.getHost())&&u.getPort()==8806&&u.getUserInfo()==null;}catch(Exception e){return false;}}
    private void startQuickActivity(Intent intent){startActivity(intent);overridePendingTransition(0,0);}
    private void requestFileAccess(){
        LocalFiles files=((HomeViewApplication)getApplication()).files();if(files.granted()){notifyLocalRefresh();return;}
        if(files.asked()&&!shouldShowRequestPermissionRationale(android.Manifest.permission.READ_EXTERNAL_STORAGE)){startQuickActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,Uri.fromParts("package",getPackageName(),null)));return;}
        files.markAsked();requestPermissions(new String[]{android.Manifest.permission.READ_EXTERNAL_STORAGE},1571);
    }
    @Override public void onRequestPermissionsResult(int request,String[] permissions,int[] results){super.onRequestPermissionsResult(request,permissions,results);if(request==1571||request==1641)notifyLocalRefresh();}
    private void notifyLocalRefresh(){if(webView!=null)webView.evaluateJavascript("if(window.HVDesktopHost)HVDesktopHost.refreshLocal();",null);}
    private boolean route(String url) {
        if (url.startsWith("pro8://")) {
            if (!OFFLINE.equals(webView.getUrl()) && !trusted(webView.getUrl())) return true;
            String action = Uri.parse(url).getHost();
            if ("mijia".equals(action)) openMijia();
            else if("files".equals(action))openSystemFiles();
            else if("album-storage".equals(action)){requestPermissions(new String[]{android.Manifest.permission.READ_EXTERNAL_STORAGE,android.Manifest.permission.WRITE_EXTERNAL_STORAGE},1641);}
            else if ("xiaomi-home".equals(action)) launchPackage("com.xiaomi.micolauncher", "小爱桌面不可用");
            else if ("carplay".equals(action)) launchPackage("com.shihab.diplay", "请先安装 DiPlay");
            else if ("blbl".equals(action)) launchPackage("dev.pro8.blbl", "请先安装哔哩哔哩 Pro8 版");
            else if ("vinyl".equals(action)) launchPackage("dev.pro8.vinyl", "请先安装黑胶音乐");
            else if ("input-method".equals(action)) LocalInputMethod.show(this);
            else if ("input-method-preferences".equals(action)) launchPackage("org.fcitx.fcitx5.android", "请先安装小企鹅输入法");
            else if ("adb-wifi".equals(action)) launchPackage("com.rair.adbwifi", "请先安装 ADB WiFi");
            else if ("ha".equals(action)) openHa();
            else if("first-run".equals(action))showFirstRun(false);
            else if("restore-profile".equals(action))showFirstRun(true);
            else if("ha-settings".equals(action))showHaSettings();
            else if("ha-login".equals(action))startQuickActivity(new Intent(this,HomeAssistantActivity.class));
            else if ("default-home".equals(action)) {
                Intent target=LocalLauncherStatus.homeSettings(this);
                try{if(target!=null)startQuickActivity(target);else Toast.makeText(this,"请在系统设置中选择默认桌面",Toast.LENGTH_LONG).show();}catch(Exception e){Toast.makeText(this,"默认桌面设置暂时不可用",Toast.LENGTH_LONG).show();}
            }
            else if ("server-settings".equals(action)) showSettings();
            else if ("retry".equals(action)) openHome();
            else if ("android-settings".equals(action)) {try{startQuickActivity(new Intent(Settings.ACTION_SETTINGS));}catch(Exception e){Toast.makeText(this,"系统设置不可用",Toast.LENGTH_LONG).show();}}
            else if ("installed-app".equals(action)||"app-details".equals(action)||"files-access".equals(action)||"files-select".equals(action)||"file-open".equals(action)) {
                if(!localPage(webView.getUrl()))return true;
                try{
                    HomeViewApplication application=(HomeViewApplication)getApplication();Uri request=Uri.parse(url);
                    if("files-access".equals(action)||"files-select".equals(action)){
                        requestFileAccess();
                    }else if("file-open".equals(action))startQuickActivity(application.files().open(request.getQueryParameter("id")));
                    else {
                        String pkg=request.getQueryParameter("package");Intent target="app-details".equals(action)?application.installedApps().details(pkg):application.installedApps().launch(pkg);
                        if(target==null){Toast.makeText(this,"应用已停用或没有启动界面，可查看应用详情",Toast.LENGTH_LONG).show();return true;}
                        if("installed-app".equals(action))application.recentApps().external(pkg,"pro8://installed-app?package="+Uri.encode(pkg));
                        startQuickActivity(target);
                    }
                }catch(Exception e){Toast.makeText(this,e instanceof IllegalArgumentException?e.getMessage():"暂时无法打开，请检查应用或目录授权",Toast.LENGTH_LONG).show();}
            }
            return true;
        }
        if (url.startsWith("http://") || url.startsWith("https://")) {
            if (trusted(url)) return false;
            try { startQuickActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))); }
            catch (Exception e) { Toast.makeText(this, "没有可用的浏览器", Toast.LENGTH_SHORT).show(); }
            return true;
        }
        return !url.startsWith("file:///android_asset/");
    }

    private void launchPackage(final String packageName, final String error) {
        if (LocalVendor.PACKAGE.equals(packageName) && vendor.available()) {
            vendorHandler.removeCallbacks(suspendVendor);
            final int epoch = ++vendorEpoch;
            vendorWorker.execute(new Runnable() {
                @Override public void run() {
                    try {
                        vendor.hidden(false);
                        runOnUiThread(new Runnable() {
                            @Override public void run() {
                                if (foreground && epoch == vendorEpoch) startPackage(packageName, error);
                            }
                        });
                    } catch (RuntimeException e) {
                        runOnUiThread(new Runnable() {
                            @Override public void run() { Toast.makeText(HomeActivity.this, "小爱桌面暂时无法恢复", Toast.LENGTH_LONG).show(); }
                        });
                    }
                }
            });
            return;
        }
        startPackage(packageName, error);
    }

    private void startPackage(String packageName, String error) {
        Intent intent = getPackageManager().getLaunchIntentForPackage(packageName);
        if (intent == null) { Toast.makeText(this, error, Toast.LENGTH_LONG).show(); return; }
        if (LocalVendor.PACKAGE.equals(packageName) && Settings.canDrawOverlays(this))
            startForegroundService(new Intent(this, ReturnOverlayService.class).putExtra("show_overlay", true));
        String action=packageName.equals("dev.pro8.blbl")?"blbl":packageName.equals("dev.pro8.vinyl")?"vinyl":packageName.equals("com.rair.adbwifi")?"adb-wifi":packageName.equals("com.shihab.diplay")?"carplay":"";
        if(!action.isEmpty())((HomeViewApplication)getApplication()).recentApps().external(packageName,"pro8://"+action);
        startQuickActivity(intent);
    }

    private void openSystemFiles(){
        Intent target=new Intent("android.provider.action.BROWSE").setDataAndType(Uri.parse("content://com.android.externalstorage.documents/root/primary"),"vnd.android.document/root").setPackage("com.android.documentsui");
        if(target.resolveActivity(getPackageManager())==null)target=getPackageManager().getLaunchIntentForPackage("com.android.documentsui");
        if(target==null){Toast.makeText(this,"系统文件管理器暂时不可用",Toast.LENGTH_LONG).show();return;}
        try{startQuickActivity(target);}catch(Exception e){Toast.makeText(this,"系统文件管理器暂时不可用",Toast.LENGTH_LONG).show();}
    }

    private void openMijia() {
        // The native launcher may have been suspended when HomeView resumed.
        // Restore it through the existing owner-authorized helper before routing.
        vendorHandler.removeCallbacks(suspendVendor);
        final int epoch=++vendorEpoch;
        if(vendor.available())vendorWorker.execute(()->{try{vendor.hidden(false);runOnUiThread(()->{if(foreground&&epoch==vendorEpoch)startMijia();});}catch(RuntimeException e){runOnUiThread(()->Toast.makeText(this,"内置米家暂时无法打开，请稍后重试",Toast.LENGTH_LONG).show());}});
        else startMijia();
    }
    private void startMijia(){
        Intent builtIn=new Intent(Intent.ACTION_VIEW,Uri.parse("mico://launcher/miot")).setPackage(LocalVendor.PACKAGE).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try{
            if(builtIn.resolveActivity(getPackageManager())!=null){
                if(Settings.canDrawOverlays(this))startForegroundService(new Intent(this,ReturnOverlayService.class).putExtra("show_overlay",true));
                Intent launcher=getPackageManager().getLaunchIntentForPackage(LocalVendor.PACKAGE);if(launcher==null){startQuickActivity(builtIn);return;}
                final int request=++mijiaLaunchEpoch;startQuickActivity(launcher);vendorHandler.postDelayed(()->{if(request==mijiaLaunchEpoch&&!foreground)try{startQuickActivity(builtIn);}catch(RuntimeException e){android.util.Log.w("HomeViewVendor","Mi Home navigation incomplete");}},1400);return;
            }
            Intent intent=getPackageManager().getLaunchIntentForPackage("com.xiaomi.smarthome");
            if(intent!=null){startQuickActivity(intent);return;}
        }catch(RuntimeException e){android.util.Log.w("HomeViewVendor","Mi Home entry unavailable");}
        Toast.makeText(this,"内置米家入口暂不可用",Toast.LENGTH_LONG).show();
    }
    private void showHaSettings(){
        LinearLayout layout=new LinearLayout(this);layout.setOrientation(LinearLayout.VERTICAL);layout.setPadding(32,16,32,0);
        TextView note=new TextView(this);note.setText("填写已部署的 Home Assistant 地址。Pro8 需要能访问该地址；保存后返回家庭页登录授权。");layout.addView(note);
        final EditText address=input("例如 http://192.168.1.100:8123",((HomeViewApplication)getApplication()).ha().base(),layout);
        AlertDialog dialog=new AlertDialog.Builder(this).setTitle("Home Assistant 配置").setView(layout).setNegativeButton("取消",null).setPositiveButton("保存",null).create();
        dialog.setOnShowListener(v->dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(button->{try{
            String raw=address.getText().toString().trim();Uri uri=Uri.parse(raw);String scheme=uri.getScheme(),path=uri.getPath();
            if(!("http".equals(scheme)||"https".equals(scheme))||uri.getHost()==null||uri.getUserInfo()!=null||uri.getQuery()!=null||uri.getFragment()!=null||path!=null&&!path.isEmpty()&&!path.equals("/"))throw new IllegalArgumentException("请输入 http 或 https 地址，例如 http://192.168.1.100:8123");
            String base=scheme+"://"+uri.getEncodedAuthority();
            if(!prefs().edit().putString(HA,base).commit())throw new IllegalArgumentException("保存失败，请重试");
            dialog.dismiss();notifyLocalRefresh();Toast.makeText(this,"HA 地址已保存，请在家庭页登录授权",Toast.LENGTH_LONG).show();
        }catch(Exception e){address.setError(e.getMessage());}}));dialog.show();
    }

    private void showFirstRun(boolean restore){
        if(restore&&!LocalFirstRun.canRestore(this)){Toast.makeText(this,"尚无已备份的个人配置",Toast.LENGTH_LONG).show();return;}
        new AlertDialog.Builder(this).setTitle(restore?"恢复个人配置":"重新体验首次使用").setMessage(restore?"恢复上次备份的 HomeView 登录、桌面和设置。照片、米家账号与系统设置保持。":"先在应用私有目录备份当前配置，再重置 HomeView 登录、桌面和设置。保留图片文件夹、内置米家账号和系统设置。").setNegativeButton("取消",null).setPositiveButton(restore?"恢复并重启":"备份并重置",(dialog,which)->{
            webView.evaluateJavascript("(function(){var data={};for(var i=0;i<localStorage.length;i++){var key=localStorage.key(i);data[key]=localStorage.getItem(key);}return JSON.stringify(data);})()",value->{
                vendorWorker.execute(()->{try{Object decoded=new org.json.JSONTokener(value).nextValue();org.json.JSONObject storage=new org.json.JSONObject((String)decoded);LocalFirstRun.prepare(this,storage,restore);runOnUiThread(()->{
                    webView.evaluateJavascript("localStorage.clear();",ignored->android.webkit.CookieManager.getInstance().removeAllCookies(done->{
                        Intent restart=HomeActivity.homeIntent(this).putExtra("homeview_return",true);android.app.PendingIntent intent=android.app.PendingIntent.getActivity(this,1649,restart,android.app.PendingIntent.FLAG_UPDATE_CURRENT|android.app.PendingIntent.FLAG_IMMUTABLE);
                        ((android.app.AlarmManager)getSystemService(ALARM_SERVICE)).setExact(android.app.AlarmManager.ELAPSED_REALTIME_WAKEUP,android.os.SystemClock.elapsedRealtime()+750,intent);
                        android.os.Process.killProcess(android.os.Process.myPid());
                    }));
                });}catch(Exception e){runOnUiThread(()->Toast.makeText(this,"配置备份未完成，未重置，请稍后重试",Toast.LENGTH_LONG).show());}});
            });
        }).show();
    }

    private void openHome() {
        if(webView==null){recreate();return;}
        showingOffline = false;
        try {
            LocalWebServer server = ((HomeViewApplication) getApplication()).localServer();
            webView.loadUrl(homeUrl(), server.headers());
        } catch (Exception e) {
            android.util.Log.e("HomeViewLocal", "无法启动本机界面: " + e.getClass().getSimpleName());
            offline();
        }
    }

    private void openHa() {
        String url = prefs().getString(HA, DEFAULT_HA).trim();
        if (url.length() == 0) { showSettings(); return; }
        startQuickActivity(new Intent(this,HomeAssistantActivity.class).putExtra("dashboard",true));
    }

    private void showRecovery(){
        if(motion!=null){try{motion.destroy();}catch(Exception ignored){}motion=null;}
        if(keyboardInsets!=null){try{keyboardInsets.destroy();}catch(Exception ignored){}keyboardInsets=null;}
        WebView previous=webView;webView=null;
        if(previous!=null){try{android.view.ViewParent parent=previous.getParent();if(parent instanceof android.view.ViewGroup)((android.view.ViewGroup)parent).removeView(previous);previous.destroy();}catch(Exception ignored){}}
        FrameLayout root=new FrameLayout(this);root.setBackgroundColor(Color.BLACK);
        LinearLayout card=new LinearLayout(this);card.setOrientation(LinearLayout.VERTICAL);card.setPadding(40,36,40,36);
        android.graphics.drawable.GradientDrawable background=new android.graphics.drawable.GradientDrawable();background.setColor(Color.rgb(45,58,80));background.setCornerRadius(32);card.setBackground(background);
        TextView title=new TextView(this);title.setText("桌面需要重新打开");title.setTextSize(30);title.setTextColor(Color.WHITE);card.addView(title);
        TextView note=new TextView(this);note.setText("显示界面暂时不可用。账号、照片和日程仍保留，可重新打开桌面或进入系统设置。");note.setTextSize(18);note.setTextColor(Color.rgb(212,221,235));note.setPadding(0,16,0,24);card.addView(note);
        LinearLayout buttons=new LinearLayout(this);card.addView(buttons);
        recoveryButton(buttons,"重新打开桌面",new Runnable(){public void run(){recreate();}});
        recoveryButton(buttons,"系统设置",new Runnable(){public void run(){try{startQuickActivity(new Intent(Settings.ACTION_SETTINGS));}catch(Exception e){Toast.makeText(HomeActivity.this,"系统设置不可用",Toast.LENGTH_LONG).show();}}});
        FrameLayout.LayoutParams bounds=new FrameLayout.LayoutParams(Math.min(getResources().getDisplayMetrics().widthPixels-96,960),-2,android.view.Gravity.CENTER);root.addView(card,bounds);setContentView(root);
    }
    private void recoveryButton(LinearLayout row,String label,final Runnable action){
        TextView button=new TextView(this);button.setText(label);button.setTextSize(20);button.setTextColor(Color.WHITE);button.setGravity(android.view.Gravity.CENTER);button.setPadding(20,16,20,16);
        android.graphics.drawable.GradientDrawable background=new android.graphics.drawable.GradientDrawable();background.setColor(Color.rgb(73,94,125));background.setCornerRadius(24);button.setBackground(background);LinearLayout.LayoutParams size=new LinearLayout.LayoutParams(0,-2,1);size.setMargins(0,0,16,0);row.addView(button,size);button.setOnClickListener(new View.OnClickListener(){public void onClick(View v){action.run();}});
    }
    private void offline() {
        if (showingOffline || webView == null) return;
        showingOffline = true;
        webView.loadUrl(OFFLINE);
    }

    private EditText input(String label, String value, LinearLayout parent) {
        TextView title = new TextView(this);
        title.setText(label);
        title.setTextSize(16);
        parent.addView(title);
        EditText edit = new EditText(this);
        edit.setSingleLine(true);
        edit.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        edit.setText(value);
        edit.setSelectAllOnFocus(true);
        parent.addView(edit);
        return edit;
    }

    private void showSettings() {
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        int pad = (int) (20 * getResources().getDisplayMetrics().density);
        layout.setPadding(pad, pad, pad, pad);
        TextView local = new TextView(this);
        local.setText("桌面与音乐已在 Pro 8 本机运行。以下地址仅用于其他家庭数据。");
        local.setTextSize(17); layout.addView(local);
        final EditText server = input("可选家庭数据服务器（可留空）", prefs().getString(SERVER, DEFAULT_SERVER), layout);
        final EditText ha = input("Home Assistant 地址（可留空）", prefs().getString(HA, DEFAULT_HA), layout);
        final CheckBox closeVendor = new CheckBox(this);
        closeVendor.setText("返回 HomeView 后关闭小爱桌面");
        closeVendor.setChecked(prefs().getBoolean("vendor_suspend", true));
        closeVendor.setEnabled(vendor.available());
        layout.addView(closeVendor);
        if (!vendor.available()) {
            TextView note = new TextView(this);
            note.setText("自动关闭小爱桌面需要先授权本机设备管理。");
            layout.addView(note);
        }
        final CheckBox doubleSleep = new CheckBox(this);
        doubleSleep.setText("实体键双击熄屏");
        doubleSleep.setChecked(prefs().getBoolean("double_home_sleep", true));
        layout.addView(doubleSleep);
        android.widget.Button screenPermission = new android.widget.Button(this);
        boolean screenReady = new HomeKeyController(this).authorized();
        screenPermission.setText(screenReady ? "已启用熄屏授权" : "启用双击熄屏");
        screenPermission.setEnabled(!screenReady);
        screenPermission.setOnClickListener(v -> {
            Intent grant = new Intent(android.app.admin.DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN);
            grant.putExtra(android.app.admin.DevicePolicyManager.EXTRA_DEVICE_ADMIN, new android.content.ComponentName(this, HomeViewAdmin.class));
            grant.putExtra(android.app.admin.DevicePolicyManager.EXTRA_ADD_EXPLANATION, "仅用于实体键双击关闭屏幕。");
            startQuickActivity(grant);
        });
        layout.addView(screenPermission);
        new AlertDialog.Builder(this)
            .setTitle("Pro 8 连接设置")
            .setView(layout)
            .setNeutralButton(vendor.available() ? "取消本机管理" : "重试", new DialogInterface.OnClickListener() {
                @Override public void onClick(DialogInterface dialog, int which) {
                    if (!vendor.available()) { openHome(); return; }
                    new AlertDialog.Builder(HomeActivity.this).setTitle("取消本机管理")
                        .setMessage("恢复小爱桌面并关闭自动停止功能。")
                        .setNegativeButton("保留", null)
                        .setPositiveButton("取消管理", new DialogInterface.OnClickListener() {
                            @Override public void onClick(DialogInterface d, int w) {
                                ++vendorEpoch; vendorHandler.removeCallbacks(suspendVendor);
                                vendorWorker.execute(new Runnable() {
                                    @Override public void run() {
                                        try { vendor.release(); prefs().edit().putBoolean("vendor_suspend", false).apply(); }
                                        catch (RuntimeException e) { android.util.Log.w("HomeViewVendor", "取消管理未完成"); }
                                    }
                                });
                            }
                        }).show();
                }
            })
            .setNegativeButton("取消", null)
            .setPositiveButton("保存并连接", new DialogInterface.OnClickListener() {
                @Override public void onClick(DialogInterface dialog, int which) {
                String address = server.getText().toString().trim();
                String dashboard = ha.getText().toString().trim();
                if ((address.length() > 0 && !address.startsWith("http://") && !address.startsWith("https://")) ||
                    (dashboard.length() > 0 && !dashboard.startsWith("http://") && !dashboard.startsWith("https://"))) {
                    Toast.makeText(HomeActivity.this, "地址需要以 http:// 或 https:// 开头", Toast.LENGTH_LONG).show();
                    return;
                }
                prefs().edit().putString(SERVER, address.length() > 0 ? normalize(address) : "").putString(HA, dashboard)
                    .putBoolean("vendor_suspend", closeVendor.isChecked()).putBoolean("double_home_sleep", doubleSleep.isChecked()).apply();
                if (!closeVendor.isChecked() && vendor.available()) {
                    ++vendorEpoch; vendorHandler.removeCallbacks(suspendVendor);
                    vendorWorker.execute(new Runnable() { @Override public void run() { try { vendor.hidden(false); } catch (RuntimeException ignored) { } } });
                } else scheduleVendorSuspend();
                openHome();
                }
            })
            .show();
    }

    private void immersive() {
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION |
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN |
            View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
    }

    @Override public void onWindowFocusChanged(boolean focus) {
        super.onWindowFocusChanged(focus);
        if (focus) immersive();
    }

    @Override protected void onResume() {
        super.onResume();
        ((HomeViewApplication)getApplication()).installedApps().invalidate();
        HomeKeyController.visible(this);
        foreground = true; ++mijiaLaunchEpoch; ++vendorEpoch; scheduleVendorSuspend();
        if(webView!=null)webView.evaluateJavascript("if(window.HVDesktopHost)HVDesktopHost.setForeground(true);",null);
        startForegroundService(new Intent(this, ReturnOverlayService.class).putExtra("show_overlay", false));
    }

    @Override protected void onPause() {
        foreground = false; ++vendorEpoch; vendorHandler.removeCallbacks(suspendVendor);
        if(motion!=null)motion.cancel();
        if(webView!=null)webView.evaluateJavascript("if(window.HVDesktopHost)HVDesktopHost.setForeground(false);",null);
        super.onPause();
    }

    @Override public void onTrimMemory(int level){
        super.onTrimMemory(level);
        if(level>=android.content.ComponentCallbacks2.TRIM_MEMORY_RUNNING_LOW){
            if(motion!=null)motion.trimMemory();
            if(webView!=null)webView.evaluateJavascript("if(window.HVDesktopHost)HVDesktopHost.trimMemory("+level+");",null);
        }
    }

    private void openSilentIntent(Intent intent){boolean muted=intent.getBooleanExtra("homeview_silent",true);webView.evaluateJavascript("if(window.HVDesktopHost)HVDesktopHost.silent("+muted+");",null);intent.removeExtra("homeview_silent");}
    private void openVinylIntent(Intent intent){webView.evaluateJavascript("if(window.HVDesktopHost)HVDesktopHost.open('/frame/hv/vinyl/');",null);intent.removeExtra("homeview_vinyl");}

    private void openClockIntent(Intent intent){String tab=intent.getBooleanExtra("homeview_alarm",false)?"alarms":"timers",id=intent.getStringExtra("timer_id");String url="/frame/hv/clock/?tab="+tab+(id==null?"":"&timer="+android.net.Uri.encode(id));webView.evaluateJavascript("if(window.HVDesktopHost)HVDesktopHost.open("+org.json.JSONObject.quote(url)+");",null);intent.removeExtra("homeview_timer");intent.removeExtra("homeview_alarm");intent.removeExtra("timer_id");}

    @Override protected void onNewIntent(Intent intent) {
        boolean wasVisible=foreground||getWindow().getDecorView().hasWindowFocus();
        super.onNewIntent(intent);
        WebView.setWebContentsDebuggingEnabled(intent.getBooleanExtra("pro8_debug", false));
        intent.removeExtra("pro8_debug");
        setIntent(intent);
        boolean homeRequest=Intent.ACTION_MAIN.equals(intent.getAction())&&intent.hasCategory(Intent.CATEGORY_HOME);
        boolean explicitReturn=intent.getBooleanExtra("homeview_return",false)||intent.hasExtra("homeview_silent")||intent.getBooleanExtra("homeview_vinyl",false)||intent.getBooleanExtra("homeview_timer",false)||intent.getBooleanExtra("homeview_alarm",false);
        long now=android.os.SystemClock.elapsedRealtime();
        if(DesktopSwitchPolicy.openNative(homeRequest,explicitReturn,wasVisible,HomeKeyController.awake(this),HomeKeyController.screenAge(),now-lastDesktopSwitch)&&getPackageManager().getLaunchIntentForPackage(LocalVendor.PACKAGE)!=null){
            lastDesktopSwitch=now;vendorHandler.removeCallbacks(suspendVendor);launchPackage(LocalVendor.PACKAGE,"小爱原生桌面不可用");return;
        }

        if (webView != null) {
            if(intent.hasExtra("homeview_silent")){openSilentIntent(intent);return;}
            if (!homeUrl().equals(webView.getUrl())) openHome();
            else if(intent.getBooleanExtra("homeview_vinyl",false))openVinylIntent(intent);
            else if(intent.getBooleanExtra("homeview_timer",false)||intent.getBooleanExtra("homeview_alarm",false))openClockIntent(intent);
            else webView.evaluateJavascript("if(window.HVDesktopHost)HVDesktopHost.home();",null);
        }
        scheduleVendorSuspend();
    }

    @Override public void onBackPressed() {
        if(webView==null){Toast.makeText(this,"请点重新打开桌面，或进入系统设置",Toast.LENGTH_SHORT).show();return;}
        if (webView != null && homeUrl().equals(webView.getUrl())) {
            webView.evaluateJavascript("if(window.HVDesktopHost)window.HVDesktopHost.back();", null);
            return;
        }
        if (showingOffline) { showSettings(); return; }
        String current = webView.getUrl();
        if (current == null || current.equals(homeUrl())) { openHome(); return; }
        if (webView.canGoBack()) webView.goBack();
        else openHome();
    }

    @Override protected void onDestroy() {
        ((HomeViewApplication)getApplication()).installedApps().unwatch(localRefresh);((HomeViewApplication)getApplication()).bilibiliWidget().unwatch(widgetRefresh);
        foreground = false; ++vendorEpoch; vendorHandler.removeCallbacks(suspendVendor); vendorWorker.shutdownNow();
        if(motion!=null){motion.destroy();motion=null;}
        if(keyboardInsets!=null){keyboardInsets.destroy();keyboardInsets=null;}
        if (webView != null) { webView.removeJavascriptInterface("HomeViewRecentApps");webView.destroy(); webView = null; }
        super.onDestroy();
    }
}
