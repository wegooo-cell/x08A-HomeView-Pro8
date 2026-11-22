/* HomeView screens: shared helpers. Load after /frame/hv/config.js (window.HV_CONFIG, written by the server
   from config.json) and /frame/shared/cond.js (HVJson). ES5 on purpose (old WebView). Exposes window.HV:

   HV.now()            Date for "now" corrected by the server clock (frames drift)
   HV.local(d)        {y,mo,d,h,mi,s,dow} in the home time zone (config.json "timezone"), never the device zone
   HV.cfg             window.HV_CONFIG (home_name, timezone, place, temp_unit, calendars, timers, sonos, spotify)
   HV.calColor(key)   a calendar's color from config.json;  HV.calName(key) its name;  HV.isHoliday(key)
   HV.hm(d)            "6:05"   HV.ampm(d) "PM"
   HV.dayWord(d,short) "Today" / "Tomorrow" / "Thursday" / "Wed, Oct 21" (short: "Thu" / "Wed 21")
   HV.state            the last /api/hv/state ({timers, command, now})
   HV.on(fn)           called with HV.state after every poll
   HV.post(path, obj)  JSON POST, resolves to the reply (rejects with a readable message)
   HV.toast(text)
   HV.chrome(opts)     adds the top-right clock + Standby chip and the running-timer pills

   Voice/remote commands: a command newer than the one this frame last acted on, and under 30 s
   old, navigates to its screen once. The last seen seq is kept in localStorage per frame. */
(function(){
  if(typeof window.HVJson!=='function')window.HVJson=function(url){return fetch(url,{cache:'no-store'}).then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.json();});};
  var chromium=/(?:Chrome|Chromium)\/(\d+)/.exec(navigator.userAgent);
  if(/Pro8HomeView\//.test(navigator.userAgent))document.documentElement.classList.add('pro8-device');
  if(chromium&&Number(chromium[1])<84)document.documentElement.classList.add('legacy-webview');
  var HV=window.HV={state:{timers:[],command:null,now:Date.now()/1000}};
  HV.hostActive=true;HV.sceneBusy=false;
  var uiJobs={},uiFlush=0;
  HV.canWork=function(){return HV.hostActive&&!HV.sceneBusy&&!document.hidden;};
  function flushUI(visualOnly){
    clearTimeout(uiFlush);uiFlush=0;if(!HV.canWork())return;
    var jobs=uiJobs;uiJobs={};Object.keys(jobs).forEach(function(key){if(visualOnly&&/-load$/.test(key)){uiJobs[key]=jobs[key];return;}jobs[key]();});
  }
  // At most one pending job per view; state/audio keep running during motion.
  HV.deferUI=function(key,fn){
    if(HV.canWork()){delete uiJobs[key];fn();}else uiJobs[key]=fn;
  };
  HV.prepareUI=function(){var active=HV.hostActive,busy=HV.sceneBusy;HV.hostActive=true;HV.sceneBusy=false;try{flushUI(true);}finally{HV.hostActive=active;HV.sceneBusy=busy;}};
  HV.setHostState=function(visible,moving){
    var changed=HV.hostActive!==!!visible||HV.sceneBusy!==!!moving;
    HV.hostActive=!!visible;HV.sceneBusy=!!moving;
    if(changed){document.dispatchEvent(new CustomEvent('hv-work-change'));if(HV.canWork()){clearTimeout(uiFlush);uiFlush=setTimeout(flushUI,80);}}
  };
  document.addEventListener('visibilitychange',function(){if(HV.canWork()){clearTimeout(uiFlush);uiFlush=setTimeout(flushUI,80);}});
  HV.navigate=function(url){try{var host=window.HVDesktopHost||(parent!==window&&parent.HVDesktopHost);if(host){host.open(url);return;}}catch(ignore){}location.href=url;};
  window.addEventListener('message',function(e){if(e.origin===location.origin&&e.source===parent&&e.data&&e.data.type==='hv-frame:visibility')HV.setHostState(e.data.visible,e.data.moving);});
  HV.weatherEpoch=0;
  HV.weatherLocation=function(){try{return JSON.parse(localStorage.getItem('hv-weather-location:v2')||'null');}catch(ignore){return null;}};
  function weatherChanged(value){HV.weatherEpoch++;document.dispatchEvent(new CustomEvent('hv-weather-location-change',{detail:value}));}
  HV.setWeatherLocation=function(value){try{localStorage.setItem('hv-weather-location:v2',JSON.stringify(value));}catch(ignore){}weatherChanged(value);};
  window.addEventListener('storage',function(e){if(e.key==='hv-weather-location:v2')weatherChanged(HV.weatherLocation());});
  var CFG=HV.cfg=window.HV_CONFIG||{};
  var CALS={};(CFG.calendars||[]).forEach(function(c){CALS[c.key]=c;});
  HV.calColor=function(k){return (CALS[k]&&CALS[k].color)||'#ff9f0a';};
  HV.calName=function(k){return (CALS[k]&&CALS[k].name)||'日历';};
  HV.isHoliday=function(k){return !!(CALS[k]&&CALS[k].holidays);};   // holiday calendars show as day tags, not as events
  var skew=0, subs=[], DAYS=['周日','周一','周二','周三','周四','周五','周六'];
  var MONTHS=['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
  HV.DAYS=DAYS; HV.MONTHS=MONTHS;
  HV.now=function(){return new Date(Date.now()+skew);};
  var fmt=null;
  try{fmt=new Intl.DateTimeFormat('en-US',{timeZone:CFG.timezone||'America/New_York',hour12:false,year:'numeric',month:'numeric',day:'numeric',hour:'numeric',minute:'numeric',second:'numeric',weekday:'short'});}catch(e){}
  var WD={Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6};
  HV.local=function(d){
    d=d||HV.now();
    if(!fmt)return {y:d.getFullYear(),mo:d.getMonth()+1,d:d.getDate(),h:d.getHours(),mi:d.getMinutes(),s:d.getSeconds(),dow:d.getDay()};
    var o={};fmt.formatToParts(d).forEach(function(p){o[p.type]=p.value;});
    return {y:+o.year,mo:+o.month,d:+o.day,h:(+o.hour)%24,mi:+o.minute,s:+o.second,dow:WD[o.weekday]};
  };
  function pad(n){return n<10?'0'+n:''+n;}
  HV.pad=pad;
  HV.hm=function(d){var t=HV.local(d);return ((t.h%12)||12)+':'+pad(t.mi);};
  HV.ampm=function(d){return HV.local(d).h<12?'AM':'PM';};
  HV.mmss=function(sec){sec=Math.max(0,Math.ceil(sec));var h=Math.floor(sec/3600),m=Math.floor(sec%3600/60),s=sec%60;
    return h?h+':'+pad(m)+':'+pad(s):m+':'+pad(s);};
  /* the day of a Date, as every screen words it: 'Today', 'Tomorrow', 'Thursday' up to 6 days ahead, then
     'Wed, Oct 21' (a bare weekday a week out reads as this week's). short: 'Thu' and 'Wed 21'. */
  HV.dayWord=function(d,short){
    var t=HV.local(d),n=HV.local(),k=Math.round((Date.UTC(t.y,t.mo-1,t.d)-Date.UTC(n.y,n.mo-1,n.d))/864e5),w=DAYS[t.dow];
    if(k===0)return '今天';if(k===1)return '明天';
    if(k>1&&k<7)return w;
    return short?MONTHS[t.mo-1]+t.d+'日':MONTHS[t.mo-1]+t.d+'日 '+w;
  };
  HV.esc=function(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});};

  /* Look: 'glass' (HomeView wallpaper + glass tiles) or 'apple' (light grouped cards). ?look= wins and is
     remembered on this frame; default stays 'apple' until a look is chosen. The wallpaper follows home time. */
  HV.look=(function(){
    var q=(location.search.match(/[?&]look=(glass|apple)/)||[])[1],v=q;
    try{if(q)localStorage.setItem('hv-look',q);else v=localStorage.getItem('hv-look');}catch(e){}
    return v==='glass'?'glass':'apple';
  })();
  /* Background for the glass look, per frame (localStorage 'hv-wall'):
       {t:'auto'}              wallpaper by home time of day (default)
       {t:'color', c:'#e0791c'} a HomePod-style soft gradient built from one color
       {t:'image', id:'x.jpg'}  a wallpaper from the server's wallpapers folder (config.json wallpapers_dir)
     HV.wall() reads it, HV.setWall(obj) saves it and repaints. */
  function hex2hsl(h){h=h.replace('#','');var r=parseInt(h.substr(0,2),16)/255,g=parseInt(h.substr(2,2),16)/255,b=parseInt(h.substr(4,2),16)/255;
    var mx=Math.max(r,g,b),mn=Math.min(r,g,b),l=(mx+mn)/2,d=mx-mn,s2=0,hh=0;
    if(d){s2=l>.5?d/(2-mx-mn):d/(mx+mn);hh=mx===r?(g-b)/d+(g<b?6:0):mx===g?(b-r)/d+2:(r-g)/d+4;hh*=60;}
    return [Math.round(hh),Math.round(s2*100),Math.round(l*100)];}
  function hsl(h,s2,l){return 'hsl('+h+','+Math.max(0,Math.min(100,s2))+'%,'+Math.max(4,Math.min(92,l))+'%)';}
  HV.gradientFor=function(c){var x=hex2hsl(c),h=x[0],s2=x[1],l=x[2];
    return 'linear-gradient(160deg,'+hsl(h-6,s2+4,l+14)+' 0%,'+hsl(h,s2,l)+' 48%,'+hsl(h+8,s2+6,l-22)+' 100%)';};
  HV.wall=function(){try{var w=JSON.parse(localStorage.getItem('hv-wall')||'null');if(w&&w.t)return w;}catch(e){}return {t:'auto'};};
  function paintWall(){
    var b=document.body;if(!b||HV.look!=='glass'||b.getAttribute('data-wall')==='off')return;   // timer, night, standby stay dark
    b.className=b.className.replace(/\bwall-\w+/g,'').trim();
    var w=HV.wall(),h=HV.local().h;
    b.classList.remove('wall-light');
    if(w.t==='color'&&/^#[0-9a-fA-F]{6}$/.test(w.c||'')){b.style.background=HV.gradientFor(w.c);b.classList.add('wall-custom');
      if(hex2hsl(w.c)[2]>=58)b.classList.add('wall-light');return;}
    if(w.t==='image'&&w.id){var url='/frame/hv/wallpapers/'+encodeURIComponent(w.id);
      b.style.background='linear-gradient(180deg,rgba(0,0,0,.10),rgba(0,0,0,.26)),url("'+url+'") center/cover no-repeat #222';
      b.classList.add('wall-custom');lightness(url,function(l){if(l>0.62)b.classList.add('wall-light');});return;}
    b.style.background='';b.classList.add('wall-'+(h<5?'night':h<10?'morning':h<17?'day':h<21?'evening':'night'));
  }
  /* average luminance (0-1) of a wallpaper from an 8x8 sample, cached per URL; light ones get darker glass */
  function lightness(url,cb){
    var k='hv-wl:'+url,v=null;try{v=localStorage.getItem(k);}catch(e){}
    if(v!==null){cb(+v);return;}
    var im=new Image();im.onload=function(){try{var c=document.createElement('canvas');c.width=c.height=8;var x=c.getContext('2d');x.drawImage(im,0,0,8,8);
      var d=x.getImageData(0,0,8,8).data,t=0;for(var i=0;i<d.length;i+=4)t+=(.2126*d[i]+.7152*d[i+1]+.0722*d[i+2])/255;var l=t/64;
      try{localStorage.setItem(k,String(l.toFixed(3)));}catch(e){}cb(l);}catch(e){}};im.src=url;
  }
  HV.setWall=function(w){try{localStorage.setItem('hv-wall',JSON.stringify(w));}catch(e){}paintWall();};
  if(HV.look==='glass'){
    document.documentElement.classList.add('look-glass');
    // accent text readable over the wallpaper (glass-contrast.css)
    var gl=document.createElement('link');gl.rel='stylesheet';gl.href='/frame/hv/glass-contrast.css?v=1';(document.head||document.documentElement).appendChild(gl);
    if(document.body)paintWall();else document.addEventListener('DOMContentLoaded',paintWall);
    setInterval(paintWall,300000);
  }
  /* Standby faces this frame shows (localStorage 'hv-faces'); Settings > Standby faces edits it. */
  HV.FACES=[['photos','壁纸锁屏','手动选择背景，固定显示',1],
    ['today','今天','大日期、天气与日程',1],
    ['up','接下来','未来两周日程',1],
    ['analog','指针','时钟与日期、天气',1],['numerals','数字','醒目的数字时钟',1],
    ['island','动森锁屏','海边、烟火与水族馆',0],['collage','封面拼贴','专辑封面墙、居中时间与日期',1],['sand','砂金','细砂凹刻与连续扫秒',0],['minimal','极简','柔和的时钟',1],['month','月份','月历与日期',0]];
  HV.facesOn=function(){var on={};HV.FACES.forEach(function(f){on[f[0]]=!!f[3];});
    try{var v=JSON.parse(localStorage.getItem('hv-faces')||'null');if(v)for(var k in v)if(k in on)on[k]=!!v[k];}catch(e){}if(!Object.keys(on).some(function(k){return on[k];}))on.numerals=true;return on;};
  HV.setFace=function(k,v){var on=HV.facesOn();if(!(k in on))return on;if(!v&&on[k]&&Object.keys(on).filter(function(x){return on[x];}).length<=1)return on;on[k]=!!v;try{localStorage.setItem('hv-faces',JSON.stringify(on));}catch(e){}return on;};
  HV.calendarEvents=function(feed){(feed||[]).forEach(function(e){if(e.homeview_calendar&&e.cal)CALS[e.cal]={name:e.calendar_name||'日历',color:e.calendar_color||'#168bff'};});var out=(feed||[]).filter(function(e){return String(e.uid||'').indexOf('hv-local-')!==0;});var locals=[];try{locals=JSON.parse(localStorage.getItem('hv-app:calendar-events:v1')||'[]');}catch(ignore){}if(!Array.isArray(locals))return out;locals.forEach(function(e){if(!/^\d{4}-\d{2}-\d{2}$/.test(e.date)||!/^\d{2}:\d{2}$/.test(e.time))return;var d=e.date.split('-'),t=e.time.split(':'),wanted=Date.UTC(+d[0],+d[1]-1,+d[2],+t[0],+t[1]),candidate=wanted;for(var i=0;i<3;i++){var local=HV.local(new Date(candidate));candidate+=wanted-Date.UTC(local.y,local.mo-1,local.d,local.h,local.mi);}out.push({uid:'hv-local-'+e.id,title:e.title,start:new Date(candidate).toISOString(),end:new Date(candidate+(+e.duration||30)*60000).toISOString(),cal:'local',all_day:false});});return out;};
  HV.on=function(fn){subs.push(fn);try{fn(HV.state);}catch(e){}};
  HV.post=function(path,obj){
    return fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(obj||{}),cache:'no-store'})
      .then(function(r){return r.json().catch(function(){return {ok:false,error:'HTTP '+r.status};});})
      .then(function(d){if(d&&d.ok===false)throw new Error(d.error||'That did not work');return d;});
  };
  var toastEl=null,toastT=null;
  HV.toast=function(text){
    if(!toastEl){toastEl=document.createElement('div');toastEl.className='hv-toast';document.body.appendChild(toastEl);}
    toastEl.textContent=text;toastEl.classList.add('on');clearTimeout(toastT);toastT=setTimeout(function(){toastEl.classList.remove('on');},3500);
  };

  /* screens a command can open */
  HV.SCREENS={standby:'/frame/hv/standby/',timer:'/frame/hv/clock/?tab=timers',dinner:'/frame/hv/dinner/',
    shopping:'/frame/hv/shopping/',today:'/frame/hv/today/',calendar:'/frame/hv/calendar/',weather:'/frame/hv/weather/',launcher:'/frame/hv/',
    meals:'/frame/hv/meals/',music:'/frame/hv/music/',photos:'/frame/hv/photos/',night:'/frame/hv/night/'};
  var SEEN='hv-cmd-seen';
  function seen(){try{return +localStorage.getItem(SEEN)||0;}catch(e){return 0;}}
  function setSeen(n){try{localStorage.setItem(SEEN,String(n));}catch(e){}}
  function act(cmd){
    if(!cmd||cmd.seq<=seen())return;
    setSeen(cmd.seq);
    if(HV.state.now-cmd.at>30)return;                       // stale: a page load must not replay an old command
    var url=HV.SCREENS[cmd.screen];if(!url)return;
    if(location.pathname===url.split('?')[0]&&!/\?/.test(url))return;
    HV.navigate(url);
  }
  var first=true;
  function poll(){
    if(!HV.canWork()){setTimeout(poll,3000);return;}
    HVJson('/api/hv/state').then(function(d){
      if(d&&d.ok){
        skew=d.now*1000-Date.now();HV.state=d;
        if(first){first=false;if(d.command&&!seen())setSeen(d.command.seq);} // a frame's first ever load: don't act
        act(d.command);
        HV.deferUI('hv-state',function(){subs.forEach(function(fn){try{fn(HV.state);}catch(e){}});});
      }
    },function(){}).then(function(){setTimeout(poll,3000);});
  }
  poll();

  /* Idle return (Settings > When untouched): localStorage 'hv-idle'
     {mode: off|photos|dim, minutes: 1|3|5|10}. After that many minutes with no touch, go to Standby,
     and from 23:00 to 05:00 home time to the night clock.
     Pages opt out with <body data-idle="off"> (Standby, Night, Timer, Cook). Typing or an open sheet holds it. */
  HV.idleTarget=function(){
    var h=HV.local().h;if(h>=23||h<5)return '/frame/hv/night/';
    return '/frame/hv/standby/';
  };
  (function(){
    var cfg={mode:'photos',minutes:3};
    try{var v=JSON.parse(localStorage.getItem('hv-idle')||'null');if(v){if(['off','photos','dim'].indexOf(v.mode)>=0)cfg.mode=v.mode;if([1,3,5,10].indexOf(+v.minutes)>=0)cfg.minutes=+v.minutes;}}catch(e){}
    var q=(location.search.match(/[?&]idle=(\d+)/)||[])[1];if(q)cfg.minutes=+q/60;   // ?idle=SECONDS, for tests
    var stamp=Date.now();
    var dimmed=false,blockClick=0;
    function undim(){dimmed=false;var mask=document.getElementById('hv-idle-dim');if(mask)mask.parentNode.removeChild(mask);}
    function touch(){stamp=Date.now();undim();}
    function reloadIdle(){try{var next=JSON.parse(localStorage.getItem('hv-idle')||'null');if(next){if(['off','photos','dim'].indexOf(next.mode)>=0)cfg.mode=next.mode;if([1,3,5,10].indexOf(+next.minutes)>=0)cfg.minutes=+next.minutes;}}catch(ignore){}touch();}
    window.addEventListener('storage',function(e){if(e.key==='hv-idle')reloadIdle();});
    document.addEventListener('hv-idle-change',reloadIdle);
    document.addEventListener('pointerdown',function(e){if(dimmed){blockClick=Date.now()+500;touch();e.preventDefault();e.stopImmediatePropagation();}},{capture:true,passive:false});
    document.addEventListener('click',function(e){if(Date.now()<blockClick){e.preventDefault();e.stopImmediatePropagation();}},true);
    ['pointerdown','keydown','wheel','touchstart'].forEach(function(n){document.addEventListener(n,touch,{capture:true,passive:true});});
    document.addEventListener('visibilitychange',touch);
    function held(){var b=document.body,e=document.activeElement;if(!b||b.getAttribute('data-idle')==='off')return true;
      if(e&&/^(INPUT|TEXTAREA|SELECT)$/.test(e.tagName))return true;
      return !!document.querySelector('.hv-sheet.on,.sheet.on,.dn-sheet.on,.dn-cook.on,.ml-dt.on,.folder-modal:not([hidden]),.weather-city-dialog:not([hidden]),.fi-detail:not([hidden])');}
    HV.idleCfg=cfg;
    setInterval(function(){if(!HV.hostActive||cfg.mode==='off'||held())return;if(Date.now()-stamp>=cfg.minutes*60000){stamp=Date.now();if(cfg.mode==='dim'){if(!dimmed){dimmed=true;var mask=document.createElement('div');mask.id='hv-idle-dim';mask.style.cssText='position:fixed;left:0;top:0;right:0;bottom:0;background:rgba(0,0,0,.7);z-index:20000;pointer-events:none';document.body.appendChild(mask);}}else HV.navigate(HV.idleTarget());}},5000);
  })();

  /* top-left Back chip for screens below the Home launcher */
  HV.back=function(label,url){
    var b=document.createElement('button');b.className='hv-chip light hv-back';
    b.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>'+HV.esc(label==='Home'?'首页':label==='Settings'?'设置':label||'首页');
    b.onclick=function(){HV.navigate(url||'/frame/hv/');};document.body.appendChild(b);return b;
  };

  /* top-right chrome + timer pills */
  HV.chrome=function(opts){
    opts=opts||{};
    var c=document.createElement('div');c.className='hv-chrome';
    var clock=document.createElement('div');clock.className='hv-chip tnum'+(opts.light?' light':'');
    if(opts.clock!==false)c.appendChild(clock);
    if(opts.standby!==false){
      var b=document.createElement('button');b.className='hv-chip'+(opts.light?' light':'');b.setAttribute('aria-label','待机');
      b.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M7 15l3-3 2 2 3-4 2 3"/></svg>';
      b.onclick=function(){HV.navigate(HV.SCREENS.standby);};c.appendChild(b);
    }
    document.body.appendChild(c);
    function tickClock(){if(!HV.canWork())return;var lt=HV.local();clock.textContent=HV.pad(lt.h)+':'+HV.pad(lt.mi);}
    tickClock();setInterval(tickClock,5000);
    if(opts.timers===false)return;
    var t=document.createElement('div');t.className='hv-timers';document.body.appendChild(t);
    function drawTimers(){if(!HV.canWork())return;
      var now=HV.now().getTime()/1000,h='';
      (HV.state.timers||[]).forEach(function(x){if(x.status==='paused'||x.status==='ready')return;var left=x.status==='complete'?-1:x.ends-now;
        h+='<button class="hv-tpill tnum'+(left<=0?' done':'')+'" data-id="'+x.id+'"><i></i>'+HV.esc(x.label)+' · '+(left<=0?'完成':HV.mmss(left))+'</button>';});
      t.innerHTML=h;
    }
    t.onclick=function(){HV.navigate(HV.SCREENS.timer);};
    HV.on(drawTimers);setInterval(drawTimers,1000);
  };
})();
