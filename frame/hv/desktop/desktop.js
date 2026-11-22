/* Actual local music and household APIs. ES5. */
(function(){
  'use strict';
  var A='/frame/hv/desktop/assets/',toastTimer=null,W=HVWeather,lastWeather=null;
  function byId(id){return document.getElementById(id);}
  function toast(s){var el=byId('desktop-toast');el.textContent=s;el.classList.add('on');clearTimeout(toastTimer);toastTimer=setTimeout(function(){el.classList.remove('on');},1900);}
  function weatherTheme(){
    var w=lastWeather&&lastWeather.weather,night=W.isNight(lastWeather,W.local(lastWeather));
    byId('desktop-canvas').setAttribute('data-widget-light',night?'night':'day');
    var icon=document.querySelector('.weather-condition img'),src=W.icon(w&&w.code,night?0:1);
    if(icon.getAttribute('src')!==src)icon.src=src;
  }
  function clock(){if(!HV.canWork())return;weatherTheme();var t=HV.local();byId('status-time').textContent=HV.pad(t.h)+':'+HV.pad(t.mi);byId('weather-time').textContent=HV.pad(t.h)+':'+HV.pad(t.mi);byId('status-date').textContent=t.mo+'月'+t.d+'日 '+['星期日','星期一','星期二','星期三','星期四','星期五','星期六'][t.dow];HVPhotoWidget.tick();}
  clock();setInterval(clock,15000);
  byId('clock-open').onclick=function(e){e.preventDefault();open('clock');};
  function open(path){if(window.HVDesktopHost)window.HVDesktopHost.open('/frame/hv/'+path+'/');else location.href='/frame/hv/'+path+'/';}
  byId('weather-open').onclick=function(){open('weather');};byId('photo-open').onclick=function(){open('photos');};
  Array.prototype.forEach.call(document.querySelectorAll('[data-panel]'),function(b){b.onclick=function(){open(b.getAttribute('data-panel'));};});
  function music(){open('music');}byId('music-open').onclick=music;byId('music-title').onclick=music;
  ['prev','play','next'].forEach(function(key){byId('music-'+key).onclick=function(){window.HVDesktopHost.action({prev:'previous',play:'toggle',next:'next'}[key]);};});
  var musicSession,localCover;
  try{musicSession=new HVMusicSession(localStorage);}catch(ignore){musicSession=new HVMusicSession(null);}
  function art(track,size){
    return '/api/frame/netease/art?size='+size+'&url='+encodeURIComponent(track.art);
  }
  function songLabel(track){
    byId('track-title').textContent=track.title;
    byId('track-artist').textContent=track.artist;
  }
  localCover=new HVSavedCover('homeview:music-desktop-cover:v1',byId('widget-cover'),function(track){
    songLabel(track);
    var ambient=art(track,96)+'&ambient=1';
    if(byId('widget-ambient').getAttribute('src')!==ambient)byId('widget-ambient').src=ambient;
  });
  function renderMusic(s){
    var track=s.track,external=track&&/^[/]api[/]airplay[/]art[?]v=[0-9]+$/.test(track.art||'');
    if(external){
      songLabel(track);
      byId('widget-cover').src=track.art;
      byId('widget-ambient').src=track.art+'&ambient=1';
    }else{
      var restored=localCover.restore();
      track=musicSession.lastPlayed();
      if(track){
        if(!restored)songLabel(track);
        if(track.art)localCover.update(track,art(track,256));
      }else if(!restored){
        byId('track-title').textContent=s.signedIn===false?'音乐':'你的音乐';
        byId('track-artist').textContent=s.closed?'轻触打开音乐':s.signedIn===false?'轻触封面扫码登录':'正在连接播放器';
      }
    }
    var button=byId('music-play');
    button.setAttribute('aria-label',s.playing?'暂停音乐':'播放音乐');
    button.setAttribute('aria-pressed',String(!!s.playing));
    var icon=A+'ion-'+(s.playing?'pause':'play')+'.svg';
    if(button.querySelector('img').getAttribute('src')!==icon)button.querySelector('img').src=icon;
  }
  renderMusic({});
  document.addEventListener('hv-music-state',function(e){var state=e.detail||{};HV.deferUI('desktop-music',function(){renderMusic(state);});});
  function deviceOn(e){return HVHome.available(e)&&(e.entity_id.indexOf('climate.')===0?e.state!=='off':e.state==='on');}
  function renderHA(s){byId('widget-home-name').textContent=HVHome.homeName();var temperature=HVHome.pinned('temperature'),humidity=HVHome.pinned('humidity'),online=s.authorized&&!s.error;byId('home-connection').textContent=s.selection_required?'选择米家或 HA':!s.configured?'尚未配置':!s.authorized?'轻触登录你的家':s.error?'连接暂时中断':'家庭已连接';byId('home-open').classList.toggle('is-connected',!!online);byId('home-temperature').textContent=temperature&&HVHome.available(temperature)&&isFinite(+temperature.state)?temperature.state+'°':'--°';byId('home-humidity').textContent=humidity&&HVHome.available(humidity)&&isFinite(+humidity.state)?humidity.state+'%':'--%';['light','climate'].forEach(function(slot,index){var e=HVHome.pinned(slot),on=deviceOn(e),d=e?e.entity_id.split('.')[0]:'',button=byId('widget-'+slot+'-toggle');byId('widget-'+slot+'-name').textContent=e?HVHome.name(e):'控制 '+(index+1);byId('widget-'+slot+'-state').textContent=!e?'尚未选择':!HVHome.available(e)?'离线':on?'已开启':'已关闭';byId('widget-'+slot).classList.toggle('on',on);byId('widget-'+slot).querySelector('img').src=A+(d==='light'?'ion-bulb-outline':d==='climate'?'ion-thermometer-outline':'ion-grid-outline')+'.svg';button.disabled=!HVHome.available(e)||!!haControlBusy[slot];button.setAttribute('aria-checked',String(on));button.setAttribute('aria-label',(e?HVHome.name(e):'控制 '+(index+1))+'开关');button.setAttribute('aria-busy',String(!!haControlBusy[slot]));});byId('widget-home-summary').textContent=online?'查看家庭 · '+HVHome.devices().filter(function(e){return /^(light|switch|climate|fan|input_boolean|humidifier)\./.test(e.entity_id);}).length+' 项控制':'查看你的家';}
  var haLoading=false,mediaLoading=false,haControlBusy={},haLoadedAt=0,mediaLoadedAt=0;
  function primaryPage(){return !window.HVDesktopLayout||HVDesktopLayout.pages.current()===0;}
  function loadHA(force){if(!primaryPage()||!HV.canWork()||haLoading||!force&&Date.now()-haLoadedAt<15000)return;haLoading=true;haLoadedAt=Date.now();HVHome.load().then(function(s){HV.deferUI('desktop-ha',function(){renderHA(s);});},function(){HV.deferUI('desktop-ha',function(){byId('home-connection').textContent='连接暂时中断';byId('home-open').classList.remove('is-connected');});}).then(function(){haLoading=false;});}
  document.addEventListener('hv-home-name',function(e){byId('widget-home-name').textContent=e.detail;});
  byId('home-open').onclick=function(){open('home');};byId('home-open').onkeydown=function(e){if(e.target===this&&(e.key==='Enter'||e.key===' ')){e.preventDefault();open('home');}};
  ['light','climate'].forEach(function(kind){byId('widget-'+kind+'-toggle').onclick=function(e){e.stopPropagation();if(document.documentElement.classList.contains('layout-editing')||haControlBusy[kind])return;var device=HVHome.pinned(kind);if(!HVHome.available(device))return;haControlBusy[kind]=true;renderHA(HVHome.snapshot());HVHome.control(device,'toggle').then(function(s){haControlBusy[kind]=false;renderHA(s);},function(error){haControlBusy[kind]=false;renderHA(HVHome.snapshot());toast(error.message);});};});
  document.addEventListener('hv-work-change',function(){if(HV.canWork())loadHA();});document.addEventListener('hv-family-changing',function(){renderHA(HVHome.snapshot());});document.addEventListener('hv-family-updated',function(){loadHA(true);});window.addEventListener('storage',function(e){if(e.key==='homeview:ha-updated')HV.deferUI('desktop-ha-load',function(){loadHA(true);});});loadHA();setInterval(loadHA,15000);
  function weather(d){lastWeather=d;byId('weather-open').setAttribute('aria-label','查看'+W.city(d)+'天气');weatherTheme();var w=d.weather,metrics=document.querySelectorAll('.weather-metrics b');document.querySelector('.weather-condition').lastChild.textContent=W.city(d)+' · '+W.condition(w&&w.code);document.querySelector('.weather-temp').textContent=W.value(w&&w.temp_f,'°');document.querySelector('.weather-range').textContent=w?'最高 '+W.value(w.hi_f,'°')+'　最低 '+W.value(w.lo_f,'°')+(d.stale?' · 可能过期':''):W.status(d);metrics[0].textContent=W.time(w&&w.sunset);metrics[1].textContent=W.value(w&&w.wind_mph,' '+W.windUnit());metrics[2].textContent=W.value(w&&(w.humidity!=null?w.humidity:w.humidity_pct),'%');metrics[3].textContent=W.value(d.aqi&&d.aqi.us_aqi);}
  function loadWeather(){var epoch=HV.weatherEpoch;HVJson('/api/frame').then(function(d){if(epoch===HV.weatherEpoch)HV.deferUI('desktop-weather',function(){weather(d);});},function(){});}
  document.addEventListener('hv-weather-location-change',function(e){HV.deferUI('desktop-weather',function(){weather({city:e.detail&&e.detail.name,location:e.detail,weather:null,aqi:null,loading:true,requires_location:!e.detail});});mediaLoadedAt=0;if(HV.canWork()&&primaryPage())loadWeather();});
  function load(){
    if(!primaryPage()||!HV.canWork()||mediaLoading||Date.now()-mediaLoadedAt<60000)return;mediaLoading=true;mediaLoadedAt=Date.now();
    loadWeather();
    HVJson('/api/frame/photos').then(function(d){if(d&&d.ok!==false)HV.deferUI('desktop-photo',function(){HVPhotoWidget.update(d);});},function(){}).then(function(){mediaLoading=false;});
  }
  load();setInterval(load,60000);
  document.addEventListener('hv-album-updated',function(){mediaLoadedAt=0;if(HV.canWork())load();});window.addEventListener('storage',function(e){if(e.key==='homeview:album-updated'){mediaLoadedAt=0;if(HV.canWork())load();}});
  var resumeTimer=0;document.addEventListener('hv-work-change',function(){clearTimeout(resumeTimer);if(HV.canWork())resumeTimer=setTimeout(function(){clock();loadHA();load();},350);});
  var alert=document.createElement('div');alert.className='timer-alert';alert.hidden=true;document.body.appendChild(alert);var doneId=null;HV.on(function(s){var finished=(s.timers||[]).filter(function(t){return t.status==='complete'||t.status!=='paused'&&t.status!=='ready'&&t.ends>0&&t.ends<=s.now;})[0];alert.hidden=!finished;if(!finished)return;doneId=finished.id;alert.innerHTML='<span>'+HV.esc(finished.label)+' · 时间到</span><button data-timer-open>查看</button><button data-timer-ack>完成</button>';});alert.onclick=function(e){if(e.target.closest('[data-timer-open]'))window.HVDesktopHost.open('/frame/hv/clock/?tab=timers');else if(e.target.closest('[data-timer-ack]'))HV.post('/api/hv/timer',{action:'ack',id:doneId}).then(function(){alert.hidden=true;});};
})();
