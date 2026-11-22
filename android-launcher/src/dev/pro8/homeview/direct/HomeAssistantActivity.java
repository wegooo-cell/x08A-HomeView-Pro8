package dev.pro8.homeview.direct;
import android.app.Activity;
import android.os.Bundle;
import android.content.Intent;
import android.net.Uri;
import android.webkit.*;
import android.widget.*;
import java.util.concurrent.*;

/** A separate top-level HA login view: respects HA's SAMEORIGIN policy and preserves the music document. */
public final class HomeAssistantActivity extends Activity {
 private WebView view;private HomeAssistantClient ha;private final ExecutorService worker=Executors.newSingleThreadExecutor();private boolean exchanging;
 @Override public void onCreate(Bundle b){super.onCreate(b);ha=((HomeViewApplication)getApplication()).ha();LinearLayout layout=new LinearLayout(this);layout.setOrientation(LinearLayout.VERTICAL);Button back=new Button(this);back.setText("‹ 返回 HomeView");back.setAllCaps(false);back.setDefaultFocusHighlightEnabled(false);back.setOnClickListener(v->finish());layout.addView(back);view=new WebView(this);view.getSettings().setJavaScriptEnabled(true);view.getSettings().setDomStorageEnabled(true);view.getSettings().setAllowFileAccess(false);view.setDefaultFocusHighlightEnabled(false);view.setWebViewClient(new WebViewClient(){@Override public boolean shouldOverrideUrlLoading(WebView v,String u){return navigate(u);}@Override public boolean shouldOverrideUrlLoading(WebView v,WebResourceRequest r){return navigate(r.getUrl().toString());}});layout.addView(view,new LinearLayout.LayoutParams(-1,0,1));setContentView(layout);try{view.loadUrl(getIntent().getBooleanExtra("dashboard",false)?ha.base():ha.login().getString("url"));}catch(Exception e){Toast.makeText(this,"请先设置 HA 地址",Toast.LENGTH_LONG).show();finish();}}
 private boolean navigate(String raw){Uri u=Uri.parse(raw);if(raw.startsWith(HomeAssistantClient.CALLBACK+"?")){if(exchanging)return true;exchanging=true;worker.execute(()->{boolean ok=true;try{ha.exchange(u.getQueryParameter("code"),u.getQueryParameter("state"));}catch(Exception e){ok=false;}final boolean success=ok;runOnUiThread(()->{Toast.makeText(this,success?"已连接 Home Assistant":"授权未完成，请重新登录",Toast.LENGTH_LONG).show();finish();});});return true;}if(raw.startsWith(ha.base()+"/"))return false;return true;}
 @Override public void onBackPressed(){finish();}
 @Override public void onDestroy(){if(view!=null)view.destroy();worker.shutdownNow();super.onDestroy();}
}
