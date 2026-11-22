package dev.pro8.homeview.direct;

import android.app.Application;

/** One loopback server for the app process, shared by all Home activities. */
public final class HomeViewApplication extends Application {
    private LocalWebServer server;
    private LocalInstalledApps installedApps;private LocalFiles files;
    synchronized LocalInstalledApps installedApps(){if(installedApps==null)installedApps=new LocalInstalledApps(this);return installedApps;}
    synchronized LocalFiles files(){if(files==null)files=new LocalFiles(this);return files;}
    private LocalBilibiliWidget bilibiliWidget;
    synchronized LocalBilibiliWidget bilibiliWidget(){if(bilibiliWidget==null)bilibiliWidget=new LocalBilibiliWidget(this);return bilibiliWidget;}
    private LocalRecentApps recentApps;
    synchronized LocalRecentApps recentApps(){if(recentApps==null)recentApps=new LocalRecentApps(this);return recentApps;}
    private HomeAssistantClient ha;private LocalAirPlay airplay;
    synchronized LocalAirPlay airplay(){if(airplay==null)airplay=new LocalAirPlay(this);return airplay;}
    synchronized HomeAssistantClient ha(){if(ha==null)ha=new HomeAssistantClient(this);return ha;}
    @Override public void onCreate(){super.onCreate();try{LocalFirstRun.applyPending(this);}catch(Exception e){android.util.Log.e("HomeViewProfile","Profile reset or restore incomplete");}SetupImport.applyPending(this);LocalTimers.restore(this);LocalClock.restore(this,false);}

    synchronized LocalWebServer localServer() throws Exception {
        if (server == null || !server.isRunning()) {
            if (server != null) server.close();
            server = null;
            server = new LocalWebServer(this);
        }
        return server;
    }
}
