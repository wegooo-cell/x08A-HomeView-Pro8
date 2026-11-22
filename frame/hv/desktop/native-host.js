/* Persistent actual music runtime, shared with the fixed Home/clock surfaces. ES5. */
(function(){
  'use strict';
  var fast=document.documentElement.classList.contains('launcher-fast'),lastTouch=0,musicWarmTimer=0,swipeMoveRAF=0;
  var musicSkin='classic',silentDebug=false,appHistory=[],pendingDesktopEdit=false;
  var music=null,app=null,active='',state=null,queued=[],clockActive=null,hostForeground=true,swipe=null,swipeRAF=0,homeWarm=0,appDismissed=false,desktop=document.querySelector('.desktop-content'),zoom=null,zoomRAF=0,homeDrag=null,nativeWork=null,origins={},lastAnchor=null,reduced=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function nativeAvailable(){return !fast&&window.HVNativeMotion&&HVNativeMotion.available();}
  function nativeEnd(job){if(nativeWork!==job)return false;nativeWork=null;document.documentElement.classList.remove('native-app-motion');return true;}
  function prepareFrame(f){try{var h=f&&f.contentWindow.HV;if(h&&h.prepareUI)h.prepareUI();}catch(ignore){}}
  function nativeZoom(kind,f,from,to,type,done){
    if(!nativeAvailable())return false;
    if(type==='open')prepareFrame(f);
    var job={frame:f,type:type};nativeWork=job;document.documentElement.classList.add('native-app-motion');
    return HVNativeMotion.start(type==='open',f,function(stage){
      if(nativeWork!==job)return;
      if(stage==='background'){if(window.HVRecentApps)HVRecentApps.hideForLaunch();setActive(kind);HVNativeMotion.capture();return;}
      HVNativeMotion.move(from,1);HVNativeMotion.finish(to,type==='close'?0:1,type==='open'?240:180);
    },function(){if(nativeEnd(job)&&done)done();},function(){
      if(!nativeEnd(job))return;if(type==='open'){if(window.HVRecentApps)HVRecentApps.hideForLaunch();setActive(kind);}runZoom(f,from,to,type,done);
    });
  }
  function message(f,data){if(f&&f.contentWindow)f.contentWindow.postMessage(data,location.origin);}
  function frameActivity(f,type,visible,moving){
    if(!f)return;visible=visible&&hostForeground;var key=String(visible)+':'+String(moving);if(f.hvActivity===key)return;f.hvActivity=key;
    message(f,{type:type,visible:visible,moving:moving});
  }
  function visibility(){
    if(loadingCover)loadingCover.hidden=!(active==='app'&&app&&!app.hvReady);
    var root=document.documentElement,shown=active||(swipe?swipe.kind:''),moving=root.classList.contains('desktop-paging')||root.classList.contains('native-app-motion')||root.classList.contains('native-app-transition')||root.getAttribute('data-scene')==='dissolving'||root.classList.contains('recent-apps-open');
    if(window.HV&&HV.setHostState)HV.setHostState(hostForeground&&!active&&root.getAttribute('data-scene')==='desktop',moving);
    if(fast)queueMusicWarm();
    frameActivity(music,'hv-music:visibility',shown==='music',moving);
    frameActivity(app,'hv-frame:visibility',shown==='app',moving);syncInputProbe();
    var clock=document.querySelector('.scene-frame'),on=!active&&root.getAttribute('data-scene')!=='desktop';
    if(clock&&!clock.hvHostBound){clock.hvHostBound=true;clock.addEventListener('load',function(){clock.hvActivity='';visibility();});}
    frameActivity(clock,'hv-frame:visibility',on,moving);
    // One bounded desktop texture, captured only after it is idle. It lets
    // a return after horizontal entry hide the WebView during native scaling.
    clearTimeout(homeCacheTimer);homeCacheTimer=0;
    if(!fast&&hostForeground&&!active&&!moving&&root.getAttribute('data-scene')==='desktop')homeCacheTimer=setTimeout(function(){homeCacheTimer=0;if(!active&&!swipe&&!nativeWork&&nativeAvailable())HVNativeMotion.cacheHome();},600);
  }
  var homeCacheTimer=0;var loadingCover=document.createElement('div');loadingCover.className='native-app-loading-cover';loadingCover.hidden=true;loadingCover.setAttribute('aria-hidden','true');document.body.appendChild(loadingCover);
  function bindFrame(f){try{var doc=f.contentDocument;if(!doc)return;doc.addEventListener('pointerdown',function(){if(window.HVHomeIndicator)HVHomeIndicator.show();},true);
    doc.addEventListener('click',function(e){var link=e.target.closest('a[href]');if(!link)return;var u=new URL(link.href,location.href);
      if(u.origin!==location.origin||u.pathname.indexOf('/frame/hv/')!==0)return;if(u.pathname==='/frame/hv/files/'){if(/Pro8HomeView/.test(navigator.userAgent))location.href='pro8://files';else if(window.HV)HV.toast('请在 Pro8 上打开文件管理器');return;}
      e.preventDefault();e.stopImmediatePropagation();open(u.pathname+u.search);
    },true);
  }catch(ignore){}}
  function recordRecent(f,visible){try{if(!window.HomeViewRecentApps||!f)return;var u=new URL(f.src,location.origin);if(u.origin===location.origin){var route=f===music&&musicSkin==='vinyl'?'/frame/hv/vinyl/':u.pathname;if(visible)HomeViewRecentApps.active(route);else HomeViewRecentApps.loaded(route);}}catch(ignore){}}
  function makeFrame(kind,url){
    var f=document.createElement('iframe');f.className='native-app-frame';f.style.backgroundColor='#000';f.width=1280;f.height=800;f.title=kind==='music'?'音乐':'HomeView 应用';f.setAttribute('aria-hidden','true');f.tabIndex=-1;
    f.hvReady=false;f.classList.add('is-navigating');f.addEventListener('load',function(){try{var requested=new URL(f.getAttribute('src'),location.origin),loaded=f.contentWindow.location;if(requested.origin===location.origin&&loaded.origin===location.origin&&requested.pathname!==loaded.pathname)return;}catch(ignore){}f.hvReady=true;f.classList.remove('is-navigating');f.hvActivity='';if(f===music){message(f,{type:'hv-music:silent',muted:silentDebug});message(f,{type:'hv-music:skin',skin:musicSkin});}recordRecent(f,false);f.classList.remove('is-loading');if(f===app){try{var path=f.contentWindow.location.pathname;
      if(path==='/frame/hv/'||path==='/frame/hv/standby/'){home();if(path.indexOf('/standby/')>=0&&window.HVClockBridge)window.HVClockBridge.close();return;}
    }catch(ignore){}}bindFrame(f);visibility();if(f===app)message(app,{type:'hv-frame:keyboard',height:keyboardHeight,visibleHeight:800-keyboardHeight});if(swipe&&swipe.frame===f){prepareSwipeContent(swipe);paintSwipe();if(swipe.finishing)settleSwipe(swipe);}});
    f.src=url;document.body.appendChild(f);return f;
  }
  function queueMusicWarm(delay){clearTimeout(musicWarmTimer);musicWarmTimer=0;if(music||!hostForeground||active)return;musicWarmTimer=setTimeout(function(){musicWarmTimer=0;if(music||!hostForeground||active)return;var root=document.documentElement;if(root.classList.contains('desktop-paging')||root.classList.contains('native-app-transition')||root.classList.contains('native-app-motion')||root.classList.contains('recent-apps-open')||root.classList.contains('layout-editing')||root.getAttribute('data-scene')!=='desktop')return;if(performance.now()-lastTouch<800){queueMusicWarm(800);return;}musicFrame();},delay||800);}
  document.addEventListener('pointerdown',function(){lastTouch=performance.now();},{capture:true,passive:true});document.addEventListener('pointermove',function(){lastTouch=performance.now();},{capture:true,passive:true});
  function musicFrame(){clearTimeout(musicWarmTimer);musicWarmTimer=0;if(!music)music=makeFrame('music','/frame/hv/music/?hosted=1');return music;}
  function setActive(kind){active=kind;try{if(window.HomeViewRecentApps){if(kind)recordRecent(kind==='music'?music:app,true);else HomeViewRecentApps.active('');}}catch(ignore){}[music,app].forEach(function(f){if(!f)return;var on=f===(kind==='music'?music:kind==='app'?app:null);f.classList.toggle('active',on);f.setAttribute('aria-hidden',String(!on));f.tabIndex=on?0:-1;});document.documentElement.classList.toggle('native-app-open',!!kind);visibility();if(window.HVHomeIndicator)HVHomeIndicator.scene();}
  function homeNow(){appHistory=[];setActive('');warmHome();if(pendingDesktopEdit&&window.HVDesktopLayout){pendingDesktopEdit=false;HVDesktopLayout.enter();}if(window.HVClockBridge)HVClockBridge.open();}
  function home(){if(window.HVRecentApps&&HVRecentApps.isOpen()){HVRecentApps.close();return;}if(!active&&window.HVDesktopLayout&&HVDesktopLayout.pages.current()>0){HVDesktopLayout.pages.go(0);return;}cancelSwipe();if(zoom&&zoom.type==='close'||nativeWork&&nativeWork.type==='close')return;stopZoom();if(fast){homeNow();return;}if(active){var f=active==='music'?music:app,to=anchorMatrix(origins[active]||originFor('/frame/hv/'+(active==='music'?'music':'home')+'/'));if(!nativeZoom(active,f,[0,0,1,1],to,'close',homeNow))runZoom(f,[0,0,1,1],to,'close',homeNow);}else homeNow();}
  function open(url,backing){cancelSwipe();stopZoom();var previous=active,u;try{u=new URL(url,location.origin);}catch(ignore){return;}if(u.origin!==location.origin||u.pathname.indexOf('/frame/hv/')!==0)return;
    if(u.pathname==='/frame/hv/timer/'||u.pathname==='/frame/hv/timer'){u.pathname='/frame/hv/clock/';u.searchParams.set('tab','timers');}
    if(u.pathname==='/frame/hv/'){pendingDesktopEdit=u.searchParams.get('edit')==='1';home();return;}pendingDesktopEdit=false;
    if(u.pathname==='/frame/hv/standby/'){var f=document.querySelector('.scene-frame');if(f&&f.contentWindow.HVClockCarousel){var name=u.searchParams.get('face')||localStorage.getItem('homeview-design:clock-current:v2');if(/^(info|week|weather)$/.test(name))name='numerals';if(name&&!(u.searchParams.get('gallery')==='1'&&f.contentWindow.HVClockGallery&&f.contentWindow.HVClockGallery.isOpen()))f.contentWindow.HVClockCarousel.select(name);}setActive('');if(window.HVClockBridge)window.HVClockBridge.close();if(u.searchParams.get('gallery')==='1')setTimeout(function(){if(f&&f.contentWindow.HVClockGallery)f.contentWindow.HVClockGallery.openGallery();},260);return;}
    if(u.pathname==='/frame/hv/music/'||u.pathname==='/frame/hv/vinyl/'){musicSkin=u.pathname.indexOf('/vinyl/')>=0||u.searchParams.get('skin')==='vinyl'?'vinyl':'classic';var mf=musicFrame();if(mf.hvReady)message(mf,{type:'hv-music:skin',skin:musicSkin});if(!previous)openZoom('music',mf,u.pathname);else setActive('music');return;}
    var target=u.pathname+u.search,previousRoute=app&&app.getAttribute('src');
    if(!previous)appHistory=[];
    else if(previous==='app'&&!backing&&previousRoute&&previousRoute!==target){var earlier=appHistory.lastIndexOf(target);if(earlier>=0)appHistory=appHistory.slice(0,earlier);else{appHistory.push(previousRoute);if(appHistory.length>12)appHistory.shift();}}
    appDismissed=false;if(!app)app=makeFrame('app',target);else if(previousRoute!==target){app.hvReady=false;app.classList.add('is-navigating');app.src=target;}
    if(!previous)openZoom('app',app,u.pathname);else setActive('app');
  }
  function warmHome(){clearTimeout(homeWarm);if(fast)return;if(app||appDismissed)return;homeWarm=setTimeout(function(){if(active||swipe||app||appDismissed)return;app=makeFrame('app','/frame/hv/home/');},900);}
  // Horizontal scenes use the same live content motion as clock-bridge.
  // Keep each full-size wallpaper anchored; never wait for PixelCopy on a drag.
  var SCENE_TRAVEL=240;
  function prepareSwipeContent(current){
    if(!fast&&current.frame.hvReady)prepareFrame(current.frame);
    try{current.content=current.frame.contentDocument.querySelector('[data-hv-scene-content]');}catch(ignore){current.content=null;}
    if(current.content)current.content.style.willChange='transform';
  }
  function paintSwipe(){
    if(!swipe)return;var p=Math.max(0,Math.min(1,swipe.p)),f=swipe.frame;
    f.style.opacity=String(f.hvReady?p:0);
    if(!swipe.content||!swipe.content.parentNode)prepareSwipeContent(swipe);
    if(swipe.content)swipe.content.style.transform=reduced?'none':'translate3d('+(swipe.side*(1-p)*SCENE_TRAVEL)+'px,0,0)';
    // As with the clock, the incoming opaque scene supplies the dissolve.
    // An additional outgoing alpha would darken the middle of the transition.
    if(desktop)desktop.style.transform=reduced?'none':'translate3d('+(-swipe.side*p*SCENE_TRAVEL)+'px,0,0)';
  }
  function clearSwipe(){
    if(!swipe)return;var current=swipe,f=current.frame;
    clearTimeout(current.timer);if(current.animations)current.animations.forEach(function(a){a.cancel();});if(swipeRAF)cancelAnimationFrame(swipeRAF);swipeRAF=0;if(swipeMoveRAF)cancelAnimationFrame(swipeMoveRAF);swipeMoveRAF=0;
    if(current.content){current.content.style.transform='';current.content.style.willChange='';}
    f.classList.remove('is-entering');f.classList.remove('is-loading');f.style.opacity='';f.style.transform='';
    if(desktop){desktop.style.transform='';desktop.style.opacity='';}
    document.documentElement.classList.remove('native-app-transition');swipe=null;visibility();
  }
  function cancelSwipe(){clearSwipe();}
  function beginSwipe(kind){
    if(active||swipe||zoom||nativeWork||kind!=='music')return false;clearTimeout(homeWarm);
    var f=musicFrame();
    origins[kind]=originFor('/frame/hv/'+(kind==='music'?'music':'home')+'/');
    var current={kind:kind,frame:f,side:kind==='music'?-1:1,p:0};swipe=current;
    prepareSwipeContent(current);document.documentElement.classList.add('native-app-transition');
    f.classList.add('is-entering');f.classList.toggle('is-loading',!f.hvReady);visibility();paintSwipe();return true;
  }
  function moveSwipe(p){if(swipe&&!swipe.finishing){swipe.p=p;if(!swipeMoveRAF)swipeMoveRAF=requestAnimationFrame(function(){swipeMoveRAF=0;paintSwipe();});}}
  function endSwipe(current){
    if(swipe!==current)return;var commit=current.commit,kind=current.kind;
    // Commit the real scene in this task, before removing the gesture styles.
    // There is no snapshot hand-off and no intermediate desktop frame.
    if(commit)setActive(kind);clearSwipe();if(!commit)warmHome();
  }
  function settleSwipe(current){
    if(swipe!==current||swipeRAF)return;clearTimeout(current.timer);
    if(fast&&current.commit&&!current.frame.hvReady){endSwipe(current);return;}
    if(current.commit&&!current.frame.hvReady){
      // A cold shared app may still be loading. Keep the actual drag position;
      // resume from it on load, without replaying the gesture from zero.
      current.timer=setTimeout(function(){if(swipe===current){current.commit=false;settleSwipe(current);}},8000);return;
    }
    if(reduced){endSwipe(current);return;}
    var target=current.commit?1:0,from=current.p,start=performance.now(),duration=fast?110:current.commit?220:160;
    function step(now){
      if(swipe!==current)return;var t=Math.max(0,Math.min(1,(now-start)/duration)),q=1-Math.pow(1-t,3);
      current.p=from+(target-from)*q;
      if(t>=1){current.p=target;paintSwipe();endSwipe(current);return;}
      paintSwipe();swipeRAF=requestAnimationFrame(step);
    }
    swipeRAF=requestAnimationFrame(step);
  }
  function finishSwipe(commit,velocity){
    if(!swipe||swipe.finishing)return;if(swipeMoveRAF)cancelAnimationFrame(swipeMoveRAF);swipeMoveRAF=0;paintSwipe();swipe.finishing=true;swipe.commit=commit;swipe.velocity=velocity||0;settleSwipe(swipe);
  }
  function originFor(path){if(lastAnchor&&lastAnchor.path===path&&Date.now()-lastAnchor.at<1200)return lastAnchor.rect;var name=path.split('/')[3]||'home',node=document.querySelector('[data-layout="app-'+name+'"] .app-icon')||document.querySelector('[data-layout="'+name+'"] .widget')||document.querySelector('[data-layout="app-apps"] .app-icon'),r=node?node.getBoundingClientRect():{left:600,top:680,width:80,height:80};return {left:r.left,top:r.top,width:r.width,height:r.height};}
  function anchorMatrix(r){return [r.left,r.top,r.width/1280,r.height/800];}
  function matrix(f,a){f.style.transformOrigin='0 0';f.style.transform='translate3d('+a[0]+'px,'+a[1]+'px,0) scale('+a[2]+','+a[3]+')';}
  function clearZoom(){if(!zoom)return;var f=zoom.frame;if(zoom.animation)zoom.animation.cancel();clearTimeout(zoom.timer);f.classList.remove('is-zooming');f.classList.remove('is-loading');f.style.transition='';f.style.transform='';f.style.transformOrigin='';f.style.opacity='';document.documentElement.classList.remove('native-app-motion');zoom=null;}
  function stopZoom(){if(homeDrag&&homeDrag.quick){homeDrag=null;document.documentElement.classList.remove('native-app-motion');}if(nativeWork){HVNativeMotion.cancel();nativeWork=null;homeDrag=null;document.documentElement.classList.remove('native-app-motion');}if(zoomRAF)cancelAnimationFrame(zoomRAF);zoomRAF=0;clearZoom();}
  function runZoom(f,from,to,type,done){
    stopZoom();if(fast){f.style.transform='';f.style.opacity='';if(done)done();return;}var current={frame:f,type:type};zoom=current;
    f.classList.add('is-zooming');f.classList.toggle('is-loading',type==='open'&&!f.hvReady);
    document.documentElement.classList.add('native-app-motion');
    function end(){if(zoom!==current)return;clearZoom();zoomRAF=0;if(done)done();}
    if(reduced){end();return;}
    // Short ease-out without a spring tail. WebView 72 runs these keyframes
    // on the compositor, avoiding a JS style write and iframe raster per frame.
    var duration=type==='open'?240:type==='close'?180:140,frames=[
      {transform:'translate3d('+from[0]+'px,'+from[1]+'px,0) scale('+from[2]+','+from[3]+')',opacity:type==='open'?.15:1},
      {transform:'translate3d('+to[0]+'px,'+to[1]+'px,0) scale('+to[2]+','+to[3]+')',opacity:type==='close'?0:1}
    ];
    f.style.transformOrigin='0 0';f.style.transform=frames[0].transform;f.style.opacity=String(frames[0].opacity);
    if(typeof f.animate==='function'){
      current.animation=f.animate(frames,{duration:duration,easing:'cubic-bezier(.333333,1,.666667,1)',fill:'forwards'});current.animation.onfinish=end;
    }else{
      f.style.transition='transform '+duration+'ms cubic-bezier(.333333,1,.666667,1),opacity '+duration+'ms ease-out';
      zoomRAF=requestAnimationFrame(function(){if(zoom!==current)return;matrix(f,to);f.style.opacity=type==='close'?'0':'1';});
    }
    current.timer=setTimeout(end,duration+100);
  }
  function openZoom(kind,f,path){if(fast){if(window.HVRecentApps)HVRecentApps.hideForLaunch();setActive(kind);return;}origins[kind]=originFor(path);if(nativeZoom(kind,f,anchorMatrix(origins[kind]),[0,0,1,1],'open'))return;if(window.HVRecentApps)HVRecentApps.hideForLaunch();setActive(kind);runZoom(f,anchorMatrix(origins[kind]),[0,0,1,1],'open');}
  function beginHome(){
    if(!active||homeDrag||zoom&&zoom.type==='close'||nativeWork&&nativeWork.type==='close')return false;
    stopZoom();cancelSwipe();var g={frame:active==='music'?music:app,kind:active,from:[0,0,1,1]};homeDrag=g;if(fast){g.quick=true;document.documentElement.classList.add('native-app-motion');visibility();return true;}
    // A return always shrinks one bounded native texture, including apps
    // entered by a horizontal swipe. With no saved home bitmap, the hidden
    // iframe exposes the unchanged desktop under the native card instead.
    document.documentElement.classList.add('native-app-motion');
    if(nativeAvailable()){
      nativeWork=g;g.type='gesture';document.documentElement.classList.add('native-app-motion');
      g.native=HVNativeMotion.start(false,g.frame,function(){if(nativeWork!==g)return;g.ready=true;HVNativeMotion.move(g.from,1);if(g.finishing)nativeHomeFinish(g);},function(){if(!nativeEnd(g))return;if(g.commit)homeNow();},function(){
        if(!nativeEnd(g))return;g.native=false;if(g.finishing)finishHomeFallback(g);else{homeDrag=null;g.frame.classList.remove('is-zooming');g.frame.style.transform='';}
      });
      if(g.native)return true;nativeEnd(g);
    }
    g.frame.classList.add('is-zooming');return true;
  }
  function moveHome(dx,dy){if(!homeDrag||homeDrag.quick)return;var scale=1-Math.min(.35,Math.max(0,dy)/1000),a=[640*(1-scale)+dx*.12,400*(1-scale)-Math.max(0,dy)*.35,scale,scale];homeDrag.from=a;if(homeDrag.native){if(homeDrag.ready)HVNativeMotion.move(a,1);}else matrix(homeDrag.frame,a);}
  function nativeHomeFinish(g){HVNativeMotion.finish(g.to,g.commit?0:1,g.commit?180:140);}
  function finishHomeFallback(g){g.frame.classList.remove('is-zooming');runZoom(g.frame,g.from,g.to,g.commit?'close':'cancel',g.commit?homeNow:null);}
  function finishHome(commit){if(!homeDrag)return;var g=homeDrag;homeDrag=null;if(g.quick){document.documentElement.classList.remove('native-app-motion');if(commit)homeNow();else visibility();return;}g.finishing=true;g.commit=commit;g.to=commit?anchorMatrix(origins[g.kind]||originFor('/frame/hv/'+(g.kind==='music'?'music':'home')+'/')):[0,0,1,1];if(g.native){g.type=commit?'close':'cancel';if(g.ready)nativeHomeFinish(g);}else finishHomeFallback(g);}
  document.addEventListener('pointerdown',function(e){if(fast)return;var item=e.target.closest('[data-layout],[data-folder-child]');if(!item)return;var name=(item.getAttribute('data-layout')||item.getAttribute('data-folder-child')).replace(/^app-/,''),node=item.querySelector('.app-icon')||item.querySelector('.widget')||item,r=node.getBoundingClientRect();lastAnchor={path:'/frame/hv/'+name+'/',at:Date.now(),rect:{left:r.left,top:r.top,width:r.width,height:r.height}};},true);
  function action(name){if(['toggle','previous','next'].indexOf(name)<0&&!/^select:[0-9]+$/.test(name))return;musicFrame();
    if(state&&state.ready)message(music,{type:'hv-music:action',action:name});else{queued.push(name);if(queued.length>4)queued.shift();if(state&&(state.signedIn===false||state.error))open('/frame/hv/music/');}
  }
  window.addEventListener('message',function(e){if(e.origin!==location.origin||!music||e.source!==music.contentWindow||!e.data)return;
    if(e.data.type==='hv-music:home'){home();return;}if(e.data.type!=='hv-music:state')return;
    state=e.data.state;document.dispatchEvent(new CustomEvent('hv-music-state',{detail:state}));
    if(state&&state.ready&&queued.length){var todo=queued.slice();queued=[];todo.forEach(action);}else if(state&&state.signedIn===false&&queued.length){queued=[];open('/frame/hv/music/');}
  });
  document.addEventListener('click',function(e){var a=e.target.closest('a[href]');if(!a)return;var u=new URL(a.href,location.href);if(u.origin!==location.origin||u.pathname.indexOf('/frame/hv/')!==0)return;e.preventDefault();open(u.pathname+u.search);});
  document.addEventListener('hv-scene-change',visibility);document.addEventListener('hv-desktop-page',visibility);
  new MutationObserver(visibility).observe(document.documentElement,{attributes:true,attributeFilter:['class','data-scene']});
  var keyboardHeight=0,inputProbeWanted=null;
  function keyboard(height){height=Math.max(0,Math.min(650,+height||0));keyboardHeight=height;message(app,{type:'hv-frame:keyboard',height:height,visibleHeight:800-height});}
  function watchInput(on){try{if(window.HomeViewInput&&HomeViewInput.watch)HomeViewInput.watch(!!on);}catch(ignore){}}
  function syncInputProbe(){var wants=false;try{var u=app&&new URL(app.src,location.origin);wants=hostForeground&&active==='app'&&u&&u.origin===location.origin&&u.pathname==='/frame/hv/clock/';}catch(ignore){}wants=!!wants;if(wants!==inputProbeWanted){inputProbeWanted=wants;watchInput(wants);if(!wants)keyboardHeight=0;}}

  function closeTask(id){
    if(id==='web:music'&&music){try{if(music.contentWindow.HVMusicRemember)music.contentWindow.HVMusicRemember();}catch(ignore){}music.src='about:blank';music.parentNode.removeChild(music);music=null;state=null;queued=[];document.dispatchEvent(new CustomEvent('hv-music-state',{detail:{ready:false,playing:false,track:null,closed:true}}));}
    if(app&&(id==='web:app'||id==='web:app:'+(new URL(app.src,location.origin)).pathname.split('/')[3])){app.src='about:blank';app.parentNode.removeChild(app);app=null;appDismissed=true;clearTimeout(homeWarm);}
  }
  function trimMemory(level){
    // Only drop invisible UI. Audio, native AirPlay, timers and VPN stay alive.
    if(swipe||zoom||nativeWork||homeDrag)return false;
    if(active!=='music'&&music)try{if(music.contentWindow.HVMusicTrimUI)music.contentWindow.HVMusicTrimUI();}catch(ignore){}
    if(active!=='app'&&app){app.src='about:blank';app.parentNode.removeChild(app);app=null;appDismissed=true;clearTimeout(homeWarm);}
    return true;
  }
  function reopenTask(item,rect){if(item.kind==='native'){if(window.HVRecentApps)HVRecentApps.hideForLaunch();location.href=item.url;return;}var u=new URL(item.url,location.origin);lastAnchor={path:u.pathname,rect:rect,at:Date.now()};open(u.pathname+u.search);}
  function consumeFrameBack(frame){try{var w=frame&&frame.contentWindow;if(!w)return false;var event=w.document.createEvent('Event');event.initEvent('hv-back',false,true);if(!w.document.dispatchEvent(event))return true;return !!(w.AppUI&&w.AppUI.back&&w.AppUI.back());}catch(ignore){return false;}}
  function back(){
    if(window.HVPressFeedback)HVPressFeedback.clear();
    if(window.HVSystemFolder&&HVSystemFolder.close())return;
    if(window.HVDesktopLayout&&HVDesktopLayout.back())return;
    if(window.HVRecentApps&&HVRecentApps.isOpen()){HVRecentApps.close();return;}
    if(active==='music'){message(music,{type:'hv-music:action',action:'back'});return;}
    if(active==='app'){if(app&&app.hvReady&&consumeFrameBack(app))return;if(appHistory.length){open(appHistory.pop(),true);return;}home();return;}
    if(document.documentElement.getAttribute('data-scene')!=='desktop'&&consumeFrameBack(document.querySelector('.scene-frame')))return;
    home();
  }
  window.HVDesktopHost={silent:function(on){if(typeof on==='boolean'){silentDebug=on;message(music,{type:'hv-music:silent',muted:on});}return silentDebug;},trimMemory:trimMemory,closeTask:closeTask,reopenTask:reopenTask,keyboard:keyboard,refreshLocal:function(){document.dispatchEvent(new Event('hv-native-refresh'));message(app,{type:'hv-native:refresh'});},setForeground:function(on){hostForeground=!!on;visibility();},view:function(){return active;},homeGesture:{begin:beginHome,move:moveHome,finish:finishHome},swipe:{begin:beginSwipe,move:moveSwipe,finish:finishSwipe,cancel:cancelSwipe},dashboard:function(url){var u;try{u=new URL(url);}catch(ignore){return;}if(!/^https?:$/.test(u.protocol))return;if(!app)app=makeFrame('app',u.href);else app.src=u.href;setActive('app');},open:open,home:home,action:action,state:function(){return state;},back:back};
  (document.fonts?document.fonts.ready:Promise.resolve()).then(function(){if(fast)queueMusicWarm(1500);else setTimeout(musicFrame,1500);warmHome();});
})();
