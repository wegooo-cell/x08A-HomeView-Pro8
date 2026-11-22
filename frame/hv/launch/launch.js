/* Home launcher (/frame/hv/): live widgets, each opens its full screen. Refreshes every 30 s (ETag'd).
   Layout, 4 x 3:
     [ Today (2 wide)          ] [ Tonight (tall) ] [ Weather  ]
     [ Calendar ] [ Timer      ] [                ] [ Shopping ]
     [ Meals    ] [ Music      ] [ Photos         ] [ Outside  ]
   Music becomes a Standby tile when neither Sonos nor Spotify is set up in config.json. ES5. */
(function(){
  var d={frame:null,plan:null,shop:null,music:null,photos:null};
  var grid=document.getElementById('grid');
  var MUSIC=!!(HV.cfg.sonos||HV.cfg.spotify);
  var I={
    sun:'<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"/>',
    cal:'<rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    fork:'<path d="M7 3v7a2 2 0 0 0 4 0V3M9 10v11M16 3c-1.7 1.2-2.5 3.5-2.5 6.5V13H16v8"/>',
    timer:'<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9.5 2.5h5"/>',
    cart:'<path d="M3 4h2.5l2.2 10.5h10.6L20.5 7H7"/><circle cx="9.5" cy="19" r="1.5"/><circle cx="17" cy="19" r="1.5"/>',
    note:'<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
    photo:'<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M7 15l3-3 2 2 3-4 3 4"/>',
    book:'<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h11"/>',
    air:'<path d="M3 9h11a3 3 0 1 0-3-3M3 15h15a3 3 0 1 1-3 3M3 12h7"/>',
    clock:'<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'
  };
  function ic(n){return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">'+I[n]+'</svg>';}
  function kind(c){if(c==null)return '';if(c<=1)return '晴朗';if(c===2)return '多云';if(c===3)return '阴天';if(c===45||c===48)return '有雾';
    if((c>=71&&c<=77)||c===85||c===86)return '有雪';if(c>=95)return '雷雨';if(c>=51&&c<=57)return '小雨';return '有雨';}
  function upcoming(n){
    var now=HV.now().getTime();
    return ((d.frame&&d.frame.calendar_events)||[]).filter(function(e){return new Date(e.end||e.start).getTime()>now&&new Date(e.start).getTime()<now+14*864e5;})
      .sort(function(a,b){return new Date(a.start)-new Date(b.start);}).slice(0,n);
  }
  function when(e){var s=new Date(e.start),day=HV.dayWord(s,true);
    return (day==='Today'?'':day+' ')+(e.all_day?'All day':HV.hm(s)+' '+HV.ampm(s));}
  function thumb(u,size){return u?String(u)+'/'+(size||'medium'):'';}   // TheMealDB serves /small, /medium, /large
  function hm24(iso){var h=+iso.slice(11,13),m=iso.slice(14,16);return ((h%12)||12)+':'+m+' '+(h<12?'AM':'PM');}
  function w(cls,href,label,icon,body,style){
    return '<a class="w '+cls+'" href="'+href+'"'+(style?' style="'+style+'"':'')+'><div class="lbl">'+ic(icon)+label+'</div>'+body+'</a>';
  }

  function render(){
    var t=HV.local(), wx=d.frame&&d.frame.weather;
    var day=['星期日','星期一','星期二','星期三','星期四','星期五','星期六'][t.dow];
    var clock=HV.pad(t.h)+':'+HV.pad(t.mi);
    var ps=(d.photos&&d.photos.photos)||[], photo=ps.length?ps[Math.floor(Date.now()/60000)%ps.length]:null;
    document.getElementById('hello').textContent=HV.cfg.home_name||'我的家';
    document.getElementById('date').textContent=t.mo+'月'+t.d+'日 · '+day;
    var html='';
    html+=w('clockface s2','/frame/hv/standby/','时钟','clock','<div class="clock-main tnum">'+clock+'</div><div class="clock-foot"><span>'+t.mo+'月'+t.d+'日 '+day+'</span><span>轻触切换表盘 ›</span></div>');
    html+=w('wx'+(wx&&!wx.is_day?' night':wx&&wx.code>=3?' cloud':''),'/frame/hv/weather/','天气','sun',wx&&wx.temp_f!=null?'<div><div class="big">'+Math.round(wx.temp_f)+'°</div><div class="line">'+kind(wx.code)+' · '+HV.esc(HV.cfg.place||'上海')+'</div></div>':'<div class="line">查看天气预报</div>');
    html+=w('home-tile','/frame/hv/apps/','家庭','book','<div><div class="home-symbol">⌂</div><div class="line">米家与智能设备</div></div>');
    html+=w('photos s2','/frame/hv/photos/','照片','photo','<div class="line">'+(photo?'回忆，在这里呈现':'打开照片')+'</div>',photo?'background-image:url(\''+HV.esc(photo.url)+'?w=720\')':'');
    html+=w('music','/frame/hv/music/','音乐','note','<div><div class="music-art">♫</div><div class="line">打开播放器</div></div>');
    html+=w('face-tile','/frame/hv/faces/','表盘','clock','<div><div class="face-preview tnum">12 <span>3</span><br>9 <span>6</span></div><div class="line">选择时钟样式</div></div>');
    html+=w('','/frame/hv/calendar/','日历','cal','<div><div class="big">'+t.d+'</div><div class="line muted">'+day+'</div></div>');
    var timers=HV.state.timers||[],left=timers.length?HV.mmss(timers[0].ends-HV.now().getTime()/1000):'—';
    html+=w('timer','/frame/hv/timer/','计时器','timer','<div><div class="big">'+left+'</div><div class="line">'+(timers.length?'正在计时':'轻触开始')+'</div></div>');
    html+=w('apps-tile','/frame/hv/apps/','应用','photo','<div class="app-dots"><i></i><i></i><i></i><i></i></div>');
    html+=w('','/frame/hv/settings/','设置','sun','<div class="line muted">显示与待机</div>');
    grid.innerHTML=html;
  }
  function load(){
    var jobs=[
      HVJson('/api/frame').then(function(x){d.frame=x;},function(){}),
      HVJson('/api/meals/plan').then(function(x){d.plan=x;},function(){}),
      HVJson('/api/meals/shopping').then(function(x){d.shop=x;},function(){}),
      HVJson('/api/frame/photos').then(function(x){d.photos=x;},function(){})
    ];
    if(HV.cfg.sonos)jobs.push(HVJson('/api/frame/music').then(function(x){d.music=x;},function(){}));
    return Promise.all(jobs).then(render);
  }
  HV.chrome({light:true});
  // Settings chip next to the clock (Background lives under Settings)
  (function(){var c=document.querySelector('.hv-chrome');if(!c)return;var a=document.createElement('a');a.className='hv-chip light';a.href='/frame/hv/settings/';a.setAttribute('aria-label','设置');
    a.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M5.3 5.3l1.7 1.7M17 17l1.7 1.7M5.3 18.7L7 17M17 7l1.7-1.7"/></svg>';c.insertBefore(a,c.firstChild);})();
  // A native-app shelf for Pro 8. The original HomeView widgets and page geometry stay intact.
  (function(){var c=document.querySelector('.hv-chrome');if(!c)return;var a=document.createElement('a');a.className='hv-chip light';a.href='/frame/hv/apps/';a.setAttribute('aria-label','应用');
    a.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.8"/><rect x="14" y="3" width="7" height="7" rx="1.8"/><rect x="3" y="14" width="7" height="7" rx="1.8"/><rect x="14" y="14" width="7" height="7" rx="1.8"/></svg>';c.insertBefore(a,c.firstChild);})();
  HV.on(function(){if(d.frame)render();});
  render();load();setInterval(load,30000);
})();
