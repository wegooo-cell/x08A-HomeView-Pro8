/* HomeView Standby: one full-screen face at a time, crossfaded.

   Faces: photo (full-screen photo, date bottom-left, time bottom-right), analog (with four complications), week (seven days: events, dinner, weather),
   weather (now, 7 days, hours), today (date, weather, next events, dinner), np (Now Playing, only while a
   speaker plays), up (Coming up with today's weather and dinner).
   Order by home time: 05-09 weather leads and returns every third slide; the rest of the day photos,
   with a face every fourth slide; Sunday from 16:00 the month face is in the mix twice. While music
   plays, Now Playing comes every other slide.

   ?face=<name> pins one face (preview and tests). The wallpaper face uses its saved manual background.
   Only two slides exist in the DOM at once (old fades out, new fades in) to keep the 1 GB frame's
   WebView small. */
(function(){
  var ZD=['星期日','星期一','星期二','星期三','星期四','星期五','星期六'];
  var ZM=['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
  var ZW=['日','一','二','三','四','五','六'];
  var Q=new URLSearchParams(location.search), PIN=/^(info|week|weather|lounge)$/.test(Q.get('face'))?'numerals':Q.get('face');
  var stage=document.getElementById('stage');
  var data={frame:null,music:null,plan:null};
  var faceIx=0, slideN=0, cur=null, timer=null, manual=false,currentName=null,faceDirty=false;
  function inGallery(){var phase=document.documentElement.getAttribute('data-clock-gallery');return !!phase&&phase!=='closed';}

  function load(){
    var epoch=HV.weatherEpoch;return Promise.all([
      HVJson('/api/frame').then(function(d){if(epoch!==HV.weatherEpoch)return;d.calendar_events=HV.calendarEvents(d.calendar_events);data.frame=d;},function(){}),

      HV.cfg.sonos?HVJson('/api/frame/music').then(function(d){data.music=d;},function(){}):null,
      HVJson('/api/meals/plan').then(function(d){data.plan=d;},function(){})
    ]);
  }
  function playing(){
    var rooms=(data.music&&data.music.rooms)||[];
    for(var i=0;i<rooms.length;i++){var r=rooms[i];   // TV sound on the Arc and line-in are not "now playing"
      if(r.ok&&r.state==='PLAYING'&&r.title&&r.kind!=='tv'&&r.source!=='TV audio'&&r.source!=='Line-in')return r;}
    return null;
  }

  /* ---------- schedule ---------- */
  function nextFace(){
    if(PIN)return PIN;
    var t=HV.local(), n=slideN++, np=playing();
    if(np&&n%2===1)return 'np';
    var on=HV.facesOn();
    if(t.h>=5&&t.h<9&&n%3===0&&on.weather)return 'weather';
    var faces=['up','numerals','island','collage','month','today','minimal','analog','sand'];
    
    faces=faces.filter(function(f){return on[f];});
    if(!faces.length)return 'photo';
    if(!on.photos)return faces[(faceIx++)%faces.length];
    if(n%4!==3)return 'photo';
    return faces[(faceIx++)%faces.length];
  }
  /* ---------- faces ---------- */
  function el(cls,html){var d=document.createElement('div');d.className='slide '+cls;if(html)d.innerHTML=html;return d;}
  function timeText(){return HV.pad(HV.local().h)+':'+HV.pad(HV.local().mi);}
  function dateLine(){
    var t=HV.local(),wx=data.frame&&data.frame.weather,s=ZM[t.mo-1]+t.d+'日 '+ZD[t.dow];
    if(wx&&wx.temp_f!=null)s+='<span class="dot">·</span>'+Math.round(wx.temp_f)+'° '+kind(wx.code,wx.is_day);
    return s;
  }
  function kind(code,isDay){
    if(code==null)return '';
    if(code===0)return '晴朗';if(code===1)return '晴间多云';if(code===2)return '多云';if(code===3)return '阴天';
    if(code===45||code===48)return '有雾';if(code>=51&&code<=57)return '小雨';if(code>=61&&code<=67)return '有雨';
    if(code>=71&&code<=77)return '有雪';if(code>=80&&code<=82)return '阵雨';if(code===85||code===86)return '阵雪';
    if(code>=95)return '雷阵雨';return '天气';
  }
  /* object-position that keeps the subject's focus point about 45% down the screen (cover crop) */
  function position(p,c){
    var sw=innerWidth,sh=innerHeight,iw=p.w||1600,ih=p.h||1200,s=Math.max(sw/iw,sh/ih);
    var rx=sw/(iw*s),ry=sh/(ih*s),fx=c&&c.box?(c.box[0]+c.box[2])/2:.5,fy=c?c.focus_y:.4;
    var px=rx<1?Math.max(0,Math.min(1,(fx-.5*rx)/(1-rx))):.5, py=ry<1?Math.max(0,Math.min(1,(fy-.45*ry)/(1-ry))):.5;
    return Math.round(px*100)+'% '+Math.round(py*100)+'%';
  }
  function photoFace(){
    var d=el('photo'),wall=HVWallpaper.get(),appearance=HVWallpaper.appearance(wall);
    d.innerHTML='<div class="lock-wall" aria-hidden="true"></div><div class="shade-b"></div><div class="foot">'+dateLine()+'</div><div class="ctime">'+timeText()+'</div>';
    d.querySelector('.lock-wall').style.backgroundImage=appearance.wall;
    d.classList.toggle('is-light',HVWallpaper.isLight(wall));
    d.tick=function(){d.querySelector('.ctime').textContent=timeText();};
    return d;
  }
  /* ---------- shared bits for the information faces ---------- */
  function dayKeyOf(t){return t.y+'-'+HV.pad(t.mo)+'-'+HV.pad(t.d);}
  function addDays(n){return HV.local(new Date(HV.now().getTime()+n*864e5));}
  function dinnerOn(key){var m=data.plan&&data.plan.days&&data.plan.days[key];return m&&m.name?m.name:null;}
  function eventsOn(key){
    return ((data.frame&&data.frame.calendar_events)||[]).filter(function(e){
      var s=HV.local(new Date(e.start)),en=HV.local(new Date(new Date(e.end||e.start).getTime()-1));
      return dayKeyOf(s)<=key&&key<=dayKeyOf(en);
    }).sort(function(a,b){return (a.all_day?0:1)-(b.all_day?0:1)||new Date(a.start)-new Date(b.start);});
  }
  function upcoming(n){
    var now=HV.now(),end=now.getTime()+14*864e5;
    return ((data.frame&&data.frame.calendar_events)||[]).filter(function(e){var s=new Date(e.start).getTime(),en=new Date(e.end||e.start).getTime();return en>now.getTime()&&s<end;})
      .sort(function(a,b){return new Date(a.start)-new Date(b.start);}).slice(0,n);
  }
  function whenLabel(e){
    if(e.all_day)return '全天';var s=new Date(e.start);return HV.pad(HV.local(s).h)+':'+HV.pad(HV.local(s).mi);
  }
  function dayLabel(t){
    var k=dayKeyOf(t);if(k===dayKeyOf(HV.local()))return '今天';if(k===dayKeyOf(addDays(1)))return '明天';
    return ZM[t.mo-1]+t.d+'日 '+ZD[t.dow];
  }
  function dayWx(key){var ds=(data.frame&&data.frame.weather&&data.frame.weather.days)||[];for(var i=0;i<ds.length;i++)if(ds[i].date===key)return ds[i];return null;}
  var IC={
    sun:'<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/>',
    moon:'<path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z"/>',
    cloud:'<path d="M7 18.5h10a4 4 0 0 0 .4-8 6 6 0 0 0-11.5 1.6A3.3 3.3 0 0 0 7 18.5z"/>',
    partly:'<path d="M8.5 3.5v1.6M3.5 8.5h1.6M5 5l1.1 1.1M12 5l-1.1 1.1"/><path d="M6.4 11.2a3.2 3.2 0 0 1 5.4-3.1"/><path d="M8.5 20h9a3.6 3.6 0 0 0 .3-7.2 5.2 5.2 0 0 0-10 1.4A2.9 2.9 0 0 0 8.5 20z"/>',
    rain:'<path d="M7 15h10a4 4 0 0 0 .4-8 6 6 0 0 0-11.5 1.6A3.3 3.3 0 0 0 7 15z"/><path d="M8.5 18l-1 2.5M12.5 18l-1 2.5M16.5 18l-1 2.5"/>',
    snow:'<path d="M7 14.5h10a4 4 0 0 0 .4-8 6 6 0 0 0-11.5 1.6A3.3 3.3 0 0 0 7 14.5z"/><path d="M8 18.5h.01M12 20h.01M16 18.5h.01M10 21.5h.01M14 21.5h.01"/>',
    storm:'<path d="M7 14.5h10a4 4 0 0 0 .4-8 6 6 0 0 0-11.5 1.6A3.3 3.3 0 0 0 7 14.5z"/><path d="M12.5 16l-2 3.5h3l-2 3"/>',
    fog:'<path d="M4 9h16M3 13h18M5 17h14"/>',
    fork:'<path d="M7 3v7a2 2 0 0 0 4 0V3M9 10v11M16 3c-1.7 1.2-2.5 3.5-2.5 6.5V13H16v8"/>',
    cal:'<rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    sunset:'<path d="M3 17h18M7 21h10M12 4v6M8.5 7.5L12 4l3.5 3.5M5.6 13.4a6.5 6.5 0 0 1 12.8 0"/>',
    drop:'<path d="M12 3s6 6.6 6 11a6 6 0 0 1-12 0c0-4.4 6-11 6-11z"/>'
  };
  function icon(name,cls){return '<svg class="ic '+(cls||'')+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">'+(IC[name]||IC.cloud)+'</svg>';}
  function wxIcon(code,isDay){
    if(code==null)return 'cloud';if(code<=1)return isDay===false||isDay===0?'moon':'sun';if(code===2)return 'partly';if(code===3)return 'cloud';
    if(code===45||code===48)return 'fog';if((code>=71&&code<=77)||code===85||code===86)return 'snow';if(code>=95)return 'storm';return 'rain';
  }
  function hilo(wx){return '最高 '+Math.round(Math.max(wx.hi_f,wx.temp_f))+'°  最低 '+Math.round(Math.min(wx.lo_f,wx.temp_f))+'°';}
  function hm24(iso){var h=+iso.slice(11,13),m=iso.slice(14,16);return HV.pad(h)+':'+m;}
  function cmpl(ic,label,value){
    return '<div class="cmp">'+icon(ic)+'<div><span>'+HV.esc(label)+'</span><b>'+HV.esc(value)+'</b></div></div>';
  }

  /* ---------- analog: the clock plus four complications ---------- */
  function analogFace(){
    var d=el('f-analog'), h='<svg class="dial" viewBox="0 0 200 200" aria-label="Clock"><circle cx="100" cy="100" r="97" fill="#f8f5ef"/>';
    for(var i=0;i<60;i++){var a=i*Math.PI/30,L=i%5?5:11,w=i%5?1:2.6,r=93;
      h+='<line x1="'+(100+Math.sin(a)*(r-L)).toFixed(2)+'" y1="'+(100-Math.cos(a)*(r-L)).toFixed(2)+'" x2="'+(100+Math.sin(a)*r).toFixed(2)+'" y2="'+(100-Math.cos(a)*r).toFixed(2)+'" stroke="'+(i%5?'#b8b0a3':'#3a3a3c')+'" stroke-width="'+w+'" stroke-linecap="round"/>';}
    for(var q=1;q<=12;q++){var b=q*Math.PI/6;h+='<text x="'+(100+Math.sin(b)*70).toFixed(1)+'" y="'+(100-Math.cos(b)*70+7).toFixed(1)+'" text-anchor="middle" font-size="19" font-weight="600" fill="#3a3a3c" font-family="HV PingFang SC, sans-serif">'+q+'</text>';}
    h+='<line class="hh" x1="100" y1="104" x2="100" y2="54" stroke="#1d1d1f" stroke-width="6.5" stroke-linecap="round"/>'+
       '<line class="mh" x1="100" y1="106" x2="100" y2="26" stroke="#1d1d1f" stroke-width="4.5" stroke-linecap="round"/>'+
       '<line class="sh" x1="100" y1="116" x2="100" y2="20" stroke="#ff9f0a" stroke-width="1.6" stroke-linecap="round"/>'+
       '<circle cx="100" cy="100" r="3.6" fill="#ff9f0a"/></svg>';
    var t=HV.local(),wx=data.frame&&data.frame.weather,nx=upcoming(1)[0],din=dinnerOn(dayKeyOf(t));
    var left=cmpl('cal',ZD[t.dow],ZM[t.mo-1]+t.d+'日')+
      (wx&&wx.temp_f!=null?cmpl(wxIcon(wx.code,wx.is_day),(HV.cfg.place||'天气')+' · '+kind(wx.code,wx.is_day),Math.round(wx.temp_f)+'°'):'');
    var right=(nx?cmpl('cal',dayLabel(HV.local(new Date(nx.start)))+' · '+whenLabel(nx),nx.title):cmpl('cal','日历','两周内无日程'))+
      cmpl('fork','今晚晚餐',din||'尚未计划');
    d.innerHTML='<div class="side l">'+left+'</div>'+h+'<div class="side r">'+right+'</div>';
    d.tick=function(){var t2=HV.local(),hr=t2.h%12,mi=t2.mi,s=t2.s;
      d.querySelector('.hh').setAttribute('transform','rotate('+(hr*30+mi/2)+' 100 100)');
      d.querySelector('.mh').setAttribute('transform','rotate('+(mi*6+s/10)+' 100 100)');
      d.querySelector('.sh').setAttribute('transform','rotate('+(s*6)+' 100 100)');};
    d.tick();d.fast=true;return d;
  }

  /* ---------- week ahead (replaces the month face): what is actually happening each day ---------- */
  function weekFace(){
    var cols='',big=innerHeight>=900,maxEv=big?4:3;
    for(var i=0;i<7;i++){
      var t=addDays(i),key=dayKeyOf(t),ev=eventsOn(key),din=dinnerOn(key),w=dayWx(key);
      var evh='';ev.slice(0,maxEv).forEach(function(e){
        evh+='<div class="ev"><i style="background:'+HV.calColor(e.cal)+'"></i><div><b>'+HV.esc(e.title)+'</b><span>'+(e.all_day?'全天':HV.hm(new Date(e.start))+' '+HV.ampm(new Date(e.start)))+'</span></div></div>';});
      if(ev.length>maxEv)evh+='<div class="more">+'+(ev.length-maxEv)+' more</div>';
      if(!ev.length)evh='<div class="free">Free</div>';
      cols+='<div class="day'+(i===0?' today':'')+'"><div class="dh"><span>'+(i===0?'今天':'周'+ZW[t.dow])+'</span><b>'+t.d+'</b></div>'+
        (w?'<div class="dw">'+icon(wxIcon(w.code,1))+'<span>'+Math.round(w.hi_f)+'° / '+Math.round(w.lo_f)+'°</span></div>':'')+
        '<div class="dn'+(din?'':' none')+'">'+icon('fork')+'<span>'+(din?HV.esc(din):'暂无晚餐')+'</span></div>'+
        '<div class="evs">'+evh+'</div></div>';
    }
    // the summary row: what a person planning the week wants to know at a glance
    var planned=0,missing=[],wet=[],busiest=null,most=0,total=0;
    for(var j=0;j<7;j++){var tj=addDays(j),kj=dayKeyOf(tj),nm=j===0?'今天':'周'+ZW[tj.dow],ne=eventsOn(kj).length,wj=dayWx(kj);
      if(dinnerOn(kj))planned++;else missing.push(nm);
      if(wj&&wj.precip_pct>=50)wet.push(nm+' '+wj.precip_pct+'%');
      total+=ne;if(ne>most){most=ne;busiest=nm;}}
    var sum='<div class="wsum">'+
      '<div class="hv-card">'+icon('fork','big')+'<div><b>'+planned+' / 7 天已安排晚餐</b><span>'+(missing.length?'待安排：'+missing.join('、'):'每天都已安排')+'</span></div></div>'+
      '<div class="hv-card">'+icon(wet.length?'rain':'sun','big')+'<div><b>'+(wet.length?'预计 '+wet.length+' 天有雨':'暂无明显降雨')+'</b><span>'+(wet.length?wet.join(' · '):'未来七天降水概率较低')+'</span></div></div>'+
      '<div class="hv-card">'+icon('cal','big')+'<div><b>'+total+'项本周日程</b><span>'+(busiest?'最忙：'+busiest+'（'+most+'）':'暂无日程')+'</span></div></div></div>';
    return el('f-week','<div class="wh"><h2>本周</h2><span>'+HV.local().y+'年'+ZM[HV.local().mo-1]+'</span></div><div class="cols">'+cols+'</div>'+sum);
  }

  /* ---------- weather: now on the left, the week on the right, hours along the bottom ---------- */
  function weatherFace(){
    var wx=data.frame&&data.frame.weather;if(!wx||wx.temp_f==null)return todayFace();
    var cls=!wx.is_day?' night':(wx.code>=3?' cloud':'');
    var hrs='',hs=wx.hours24||wx.hourly||[];
    for(var i=1;i<hs.length&&i<=12;i+=2){var x=hs[i];hrs+='<div>'+hm24(x.t).replace(':00','')+icon(wxIcon(x.code,x.is_day))+'<b>'+Math.round(x.temp_f)+'°</b>'+(x.precip_pct>=30?'<em>'+x.precip_pct+'%</em>':'')+'</div>';}
    var ds=(wx.days||[]).slice(0,7),lo=99,hi=-99;ds.forEach(function(x){lo=Math.min(lo,x.lo_f);hi=Math.max(hi,x.hi_f);});
    var rows='';ds.forEach(function(x,j){var t=HV.local(new Date(x.date+'T12:00:00Z')),a=(x.lo_f-lo)/Math.max(1,hi-lo)*100,b=(x.hi_f-lo)/Math.max(1,hi-lo)*100;
      rows+='<div class="dr"><span class="dn">'+(j===0?'今天':'周'+ZW[t.dow])+'</span>'+icon(wxIcon(x.code,1))+'<span class="pp">'+(x.precip_pct>=30?x.precip_pct+'%':'')+'</span><span class="lo">'+Math.round(x.lo_f)+'°</span><span class="bar"><i style="left:'+a.toFixed(0)+'%;width:'+Math.max(4,b-a).toFixed(0)+'%"></i></span><span class="hi">'+Math.round(x.hi_f)+'°</span></div>';});
    return el('f-wx'+cls,'<div class="now"><div class="place">'+HV.esc(HV.cfg.place||'Home')+'</div><div class="t">'+Math.round(wx.temp_f)+'°</div><div class="cond">'+kind(wx.code,wx.is_day)+'</div>'+
      '<div class="meta">'+hilo(wx)+'<br>体感 '+Math.round(wx.feels_f!=null?wx.feels_f:wx.temp_f)+'° · 风速 '+Math.round(wx.wind_mph||0)+' '+(HV.cfg.wind_unit==='kmh'?'km/h':HV.cfg.wind_unit||'mph')+
      (wx.sunset?'<br>日落 '+hm24(wx.sunset):'')+'</div></div>'+
      (rows?'<div class="days"><h3>未来七天</h3>'+rows+'</div>':'')+(hrs?'<div class="hours">'+hrs+'</div>':''));
  }

  /* ---------- today (replaces the bare big date) ---------- */
  function todayFace(){
    var t=HV.local(),key=dayKeyOf(t),wx=data.frame&&data.frame.weather,din=dinnerOn(key),up=upcoming(3),timers=(HV.state.timers||[]).length;
    var ev='';up.forEach(function(e){var s=HV.local(new Date(e.start));
      ev+='<div class="hv-row"><i style="background:'+HV.calColor(e.cal)+'"></i><span class="t">'+HV.esc(e.title)+'</span><span class="v">'+(dayKeyOf(s)===key?'':HV.dayWord(new Date(e.start))+' ')+whenLabel(e)+'</span></div>';});
    var tomorrow=dayWx(dayKeyOf(addDays(1)));
    return el('f-today','<div class="l"><div class="d">'+ZD[t.dow]+'</div><div class="n">'+t.d+'</div><div class="m">'+t.y+'年'+ZM[t.mo-1]+'</div></div>'+
      '<div class="r">'+
        (wx&&wx.temp_f!=null?'<div class="hv-card dark wx">'+icon(wxIcon(wx.code,wx.is_day),'big')+'<div><b>'+Math.round(wx.temp_f)+'° '+kind(wx.code,wx.is_day)+'</b><span>'+hilo(wx)+(wx.precip_pct>=30?' · '+wx.precip_pct+'% 降水':'')+
          (tomorrow?' · 明天 '+Math.round(tomorrow.hi_f)+'°':'')+'</span></div></div>':'')+
        '<div class="hv-card dark"><h3>接下来的日程</h3>'+(ev||'<div class="hv-empty">未来两周没有日程</div>')+'</div>'+
        '<div class="hv-card dark din">'+icon('fork','big')+'<div><span>今晚晚餐</span><b>'+(din?HV.esc(din):'尚未计划')+'</b></div>'+(timers?'<em>'+timers+'个计时器进行中</em>':'')+'</div>'+
      '</div>');
  }

  /* ---------- coming up: the list, with today's weather and dinner beside it ---------- */
  function upFace(){
    var n=4,items=upcoming(n),h='',lastDay='',wx=data.frame&&data.frame.weather,t=HV.local(),din=dinnerOn(dayKeyOf(t));
    items.forEach(function(e){var s=HV.local(new Date(e.start)),k=dayKeyOf(s);
      if(k!==lastDay){h+='<div class="day">'+dayLabel(s)+'</div>';lastDay=k;}
      h+='<div class="ev"><i style="background:'+HV.calColor(e.cal)+'"></i><span class="tt">'+HV.esc(e.title)+'</span><span class="when">'+whenLabel(e)+'</span></div>';});
    if(!h)h='<div class="empty">未来两周没有日程</div>';
    var side='<div class="sum">'+
      (wx&&wx.temp_f!=null?'<div class="si">'+icon(wxIcon(wx.code,wx.is_day))+'<div><b>'+Math.round(wx.temp_f)+'° '+kind(wx.code,wx.is_day)+'</b><span>'+hilo(wx)+'</span></div></div>':'')+
      '<div class="si">'+icon('fork')+'<div><b>'+(din?HV.esc(din):'尚未安排晚餐')+'</b><span>今晚晚餐</span></div></div>'+
      (wx&&wx.sunset?'<div class="si">'+icon('sunset')+'<div><b>'+hm24(wx.sunset)+'</b><span>日落</span></div></div>':'')+'</div>';
    return el('f-up','<div class="l"><h2>接下来</h2><div class="sub">未来两周</div>'+side+'</div><div class="list">'+h+'</div>');
  }

  /* ---------- faces from Apple's HomeView face gallery ---------- */
  function hands(cx,cy,rh,rm,col,w1,w2,sec){
    return '<line class="hh" x1="'+cx+'" y1="'+cy+'" x2="'+cx+'" y2="'+(cy-rh)+'" stroke="'+col+'" stroke-width="'+w1+'" stroke-linecap="round"/>'+
      '<line class="mh" x1="'+cx+'" y1="'+cy+'" x2="'+cx+'" y2="'+(cy-rm)+'" stroke="'+col+'" stroke-width="'+w2+'" stroke-linecap="round"/>'+
      (sec?'<line class="sh" x1="'+cx+'" y1="'+(cy+rm*0.18)+'" x2="'+cx+'" y2="'+(cy-rm*1.02)+'" stroke="'+sec+'" stroke-width="'+Math.max(1,w2*0.32)+'" stroke-linecap="round"/>':'')+
      '<circle cx="'+cx+'" cy="'+cy+'" r="'+(w1*0.75)+'" fill="'+(sec||col)+'"/>';
  }
  function tickHands(d,cx,cy){
    var t2=HV.local(),q=function(s){return d.querySelector(s);};
    if(q('.hh'))q('.hh').setAttribute('transform','rotate('+((t2.h%12)*30+t2.mi/2)+' '+cx+' '+cy+')');
    if(q('.mh'))q('.mh').setAttribute('transform','rotate('+(t2.mi*6+t2.s/10)+' '+cx+' '+cy+')');
    if(q('.sh'))q('.sh').setAttribute('transform','rotate('+(t2.s*6)+' '+cx+' '+cy+')');
  }
  /* Info: Apple's "Tue Oct 13" face. Date, clock, today's agenda, weather on one light screen. */
  function infoFace(){
    var t=HV.local(),key=dayKeyOf(t),wx=data.frame&&data.frame.weather,ev=eventsOn(key),now=HV.now();
    var allday=ev.filter(function(e){return e.all_day;}),timed=ev.filter(function(e){return !e.all_day&&new Date(e.end||e.start)>now;});
    var show=timed.slice(0,2),more=timed.length-show.length,ag='';
    if(allday.length)ag+='<div class="ia">'+icon('cal')+'<b>'+allday.length+'项全天日程</b></div>';
    show.forEach(function(e){var s=new Date(e.start),en=new Date(e.end||e.start);
      ag+='<div class="ie" style="border-color:'+HV.calColor(e.cal)+'"><b>'+HV.hm(s)+'–'+HV.hm(en)+' '+HV.ampm(en)+'</b><span>'+HV.esc(e.title)+'</span></div>';});
    if(more>0)ag+='<div class="im">'+more+'项其他日程'+(more>1?'s':'')+'</div>';
    if(!timed.length){                       // nothing left today: the next three, with their days
      var nx=upcoming(3).filter(function(e){return dayKeyOf(HV.local(new Date(e.start)))!==key;});
      if(!allday.length)ag+='<div class="im">今天没有其他日程</div>';
      nx.forEach(function(e){var s2=new Date(e.start),dl=HV.dayWord(s2);
        ag+='<div class="ie" style="border-color:'+HV.calColor(e.cal)+'"><b>'+dl+(e.all_day?'':' · '+HV.hm(s2)+' '+HV.ampm(s2))+'</b><span>'+HV.esc(e.title)+'</span></div>';});
    }
    var clock='<svg class="ic-clock" viewBox="0 0 200 200">';
    for(var i=0;i<60;i++){var a=i*Math.PI/30,L=i%5?4:9;clock+='<line x1="'+(100+Math.sin(a)*(92-L)).toFixed(1)+'" y1="'+(100-Math.cos(a)*(92-L)).toFixed(1)+'" x2="'+(100+Math.sin(a)*92).toFixed(1)+'" y2="'+(100-Math.cos(a)*92).toFixed(1)+'" stroke="'+(i%5?'#7d8794':'#1d1d1f')+'" stroke-width="'+(i%5?1.2:2.4)+'" stroke-linecap="round"/>';}
    for(var q=1;q<=12;q++){var b=q*Math.PI/6;clock+='<text x="'+(100+Math.sin(b)*70).toFixed(1)+'" y="'+(100-Math.cos(b)*70+7).toFixed(1)+'" text-anchor="middle" font-size="20" font-weight="600" fill="#1d1d1f" font-family="HV PingFang SC, sans-serif">'+q+'</text>';}
    clock+=hands(100,100,48,74,'#1d1d1f',6,4,'#ff9f0a')+'</svg>';
    var d=el('f-info','<div class="il"><div class="idt">'+'周'+ZW[t.dow]+' '+ZM[t.mo-1]+'</div><div class="inum">'+t.d+'</div><div class="iag">'+ag+'</div></div>'+
      '<div class="ir">'+clock+(wx&&wx.temp_f!=null?'<div class="iw"><div class="iloc">'+HV.esc(HV.cfg.place||'Home')+'</div><div class="it">'+Math.round(wx.temp_f)+'°</div><div class="ic2">'+icon(wxIcon(wx.code,wx.is_day))+'<span>'+kind(wx.code,wx.is_day)+'<br>最高:'+Math.round(Math.max(wx.hi_f,wx.temp_f))+'° 最低:'+Math.round(Math.min(wx.lo_f,wx.temp_f))+'°</span></div></div>':'')+'</div>');
    d.tick=function(){tickHands(d,100,100);};d.tick();d.fast=true;return d;
  }
  /* Numerals: giant 12 / 3 / 6 / 9 with white hands over them, on a color (Apple's green face). */
  function numeralsFace(){return HVNumerals.mount(el('f-num'));}
  function sandFace(){return HVSand.mount(el('f-sand'));}
  /* Month: the grid with a huge red date behind it (Apple's calendar face). */
  function monthFace(){
    var t=HV.local(),first=new Date(t.y,t.mo-1,1).getDay(),days=new Date(t.y,t.mo,0).getDate(),ev={};
    ((data.frame&&data.frame.calendar_events)||[]).forEach(function(e){if(!HV.isHoliday(e.cal))ev[dayKeyOf(HV.local(new Date(e.start)))]=1;});
    var h='<div class="mh"><b>'+t.y+'年'+ZM[t.mo-1]+'</b><span class="mtime tnum">'+HV.pad(HV.local().h)+':'+HV.pad(HV.local().mi)+'</span></div><div class="mbig">'+t.d+'</div><table><tr>';
    '日一二三四五六'.split('').forEach(function(x){h+='<th>'+x+'</th>';});h+='</tr><tr>';
    for(var i=0;i<first;i++)h+='<td></td>';
    for(var dd=1;dd<=days;dd++){var dow=(first+dd-1)%7,k=t.y+'-'+HV.pad(t.mo)+'-'+HV.pad(dd);
      h+='<td class="'+(dd===t.d?'today':dd<t.d?'past':'')+'">'+(dd===t.d?'<span>'+dd+'</span>':dd)+(ev[k]&&dd>=t.d?'<i></i>':'')+'</td>';if(dow===6&&dd<days)h+='</tr><tr>';}
    var d=el('f-month',h+'</tr></table>');
    d.tick=function(){var m=d.querySelector('.mtime');if(m)m.textContent=HV.pad(HV.local().h)+':'+HV.pad(HV.local().mi);};return d;
  }
  /* Minimal: soft pink, embossed numerals at the quarter marks, slim hands (Apple's rose face). */
  function minimalFace(){
    var s='<svg class="mn" viewBox="0 0 200 200"><g font-family="HV PingFang SC, sans-serif" font-weight="300" fill="rgba(122,52,72,.22)" text-anchor="middle" font-size="26">'+
      '<text x="100" y="34">12</text><text x="174" y="109">3</text><text x="100" y="186">6</text><text x="26" y="109">9</text></g>'+
      hands(100,100,44,70,'#8a3a52',3.4,2.4,'#c9607e')+'</svg>';
    var d=el('f-min',s);d.tick=function(){tickHands(d,100,100);};d.tick();d.fast=true;return d;
  }

  var PLAY='<svg viewBox="0 0 24 24"><path d="M7 4l13 8-13 8z"/></svg>',PAUSE='<svg viewBox="0 0 24 24"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>',
      NEXT='<svg viewBox="0 0 24 24"><path d="M4 4l11 8-11 8zM16 4h3v16h-3z"/></svg>';
  function npFace(){
    var r=playing();if(!r)return PIN==='np'?npSample():photoFace();
    return npBuild(r.title,r.artist,r.art,(r.group||[r.name]).join(' + '),r.id);
  }
  function npSample(){return npBuild('当前未播放','音乐播放后将在这里显示','', 'Sonos','');}
  /* Now Playing, as on HomeView: the album art full screen, title and artist bottom-left. A tap opens Music. */
  function npBuild(title,artist,art,room,id){
    var d=el('f-np2','<div class="art"'+(art?' style="background-image:url(\''+HV.esc(art)+'\')"':'')+'></div><div class="shade"></div>'+
      '<div class="meta"><div class="room">'+HV.esc(room)+'</div><div class="song">'+HV.esc(title)+'</div><div class="artist">'+HV.esc(artist)+'</div></div>');
    d.addEventListener('click',function(e){e.stopPropagation();location.href='/frame/hv/music/';});
    return d;
  }
  var FACES={island:function(){var d=el('f-island');return HVIsland.mount(d);},collage:function(){return HVClockCollage.build();},numerals:numeralsFace,sand:sandFace,month:monthFace,minimal:minimalFace,photo:photoFace,depth:photoFace,plain:photoFace,analog:analogFace,today:todayFace,date:todayFace,np:npFace,up:upFace};

  /* ---------- loop ---------- */
  function show(forced){
    var name=typeof forced==='string'&&FACES[forced]?forced:nextFace(), d=(FACES[name]||photoFace)();
    currentName=name;d.setAttribute('data-clock-face',name);
    stage.appendChild(d);
    var old=cur;cur=d;
    void d.offsetWidth; d.classList.add('on');
    if(old){old.classList.remove('on');setTimeout(function(){if(old.parentNode)old.parentNode.removeChild(old);},1400);}
    clearTimeout(timer);
    if(!PIN&&!manual)timer=setTimeout(show,/photo|depth|plain/.test(d.className)?20000:15000);
    document.dispatchEvent(new CustomEvent('hv-clock-ready'));if(window.HVSand)HVSand.sync();
  }
  window.HVClockFaces={
    frame:function(){return data.frame;},current:function(){return {name:currentName,element:cur};},
    freeze:function(){manual=true;clearTimeout(timer);},
    build:function(name){var d=(FACES[name]||photoFace)();d.setAttribute('data-clock-face',name);return d;},
    render:function(name){manual=true;show(name);},
    adopt:function(name,d){manual=true;clearTimeout(timer);currentName=name;cur=d;d.classList.add('on');if(d.tick)d.tick();if(window.HVSand)HVSand.sync();if(window.HVClockCollage)HVClockCollage.sync();if(window.HVIsland)HVIsland.motion();}
  };
  setInterval(function(){if(HV.canWork()&&!inGallery()&&!document.documentElement.classList.contains('num-editing')&&cur&&cur.tick&&(cur.fast||HV.local().s<2))cur.tick();},1000);
  setInterval(function(){if(HV.canWork()&&!inGallery())load();},60000);

  document.addEventListener('ha-wallpaper-change',function(){if(/^(photo|depth|plain)$/.test(currentName||'')){if(inGallery())faceDirty=true;else show(currentName);}});
  window.addEventListener('storage',function(e){if(e.key==='hv-app:calendar-events:v1'&&data.frame){data.frame.calendar_events=HV.calendarEvents(data.frame.calendar_events);if(HV.hostActive){if(inGallery())faceDirty=true;else show(currentName);}}});
  var weatherDirty=false;
  function refreshWeather(){if(inGallery())return;weatherDirty=false;load().then(function(){if(inGallery()){weatherDirty=true;return;}if(HV.canWork()&&/^(info|analog|week|weather|today|up)$/.test(currentName||''))show(currentName);});}
  document.addEventListener('hv-weather-location-change',function(){weatherDirty=true;if(data.frame){data.frame.weather=null;data.frame.aqi=null;}if(HV.canWork())refreshWeather();});
  document.addEventListener('hv-work-change',function(){if(weatherDirty&&HV.canWork())refreshWeather();});
  document.addEventListener('hv-clock-gallery-change',function(e){if(e.detail!=='closed'||!HV.canWork())return;if(faceDirty){faceDirty=false;show(currentName);}else if(cur&&cur.tick)cur.tick();if(weatherDirty)refreshWeather();});
  var THUMB=Q.get('thumb')==='1';   // scripts/make_face_thumbs.py renders clean previews for the faces chooser
  if(!THUMB){
    HV.chrome({clock:false,standby:false});
  }
  Promise.all([load(),HVNumerals.ready]).then(show);
})();
