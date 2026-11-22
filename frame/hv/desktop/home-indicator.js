/* One compositor-only home indicator over all HomeView surfaces. ES5. */
(function(){'use strict';var bar=document.getElementById('layout-edit'),timer=0,g=null,block=0,armed=false;
if(!bar||!window.HVDesktopHost)return;document.body.appendChild(bar);bar.classList.add('home-indicator');bar.setAttribute('aria-label','上滑显示导航条，再次上滑返回主屏幕');
function inApp(){return !!HVDesktopHost.view();}
function hide(){clearTimeout(timer);timer=0;armed=false;bar.classList.add('is-idle');}
function show(fromSwipe){
  bar.hidden=document.documentElement.classList.contains('clock-controls-open')&&document.documentElement.getAttribute('data-scene')!=='desktop'&&!inApp()||document.documentElement.classList.contains('layout-editing');
  // App taps, including taps in the bottom hit area, never reveal navigation.
  if(inApp()&&fromSwipe!==true)return;
  clearTimeout(timer);bar.classList.remove('is-idle');if(inApp())armed=true;
  timer=setTimeout(function(){if(!g)hide();},3000);
}
function scene(){g=null;hide();show();}
bar.onclick=function(e){e.preventDefault();e.stopPropagation();if(Date.now()<block||inApp())return;if(window.HVRecentApps&&HVRecentApps.isOpen())HVRecentApps.close();show();};
bar.addEventListener('pointerdown',function(e){
  if(e.button&&e.button!==0||g)return;
  var recent=window.HVRecentApps&&HVRecentApps.isOpen(),fromDesktop=!inApp()&&document.documentElement.getAttribute('data-scene')==='desktop'&&!document.documentElement.classList.contains('layout-editing')&&!document.querySelector('.desktop-modal:not([hidden])');
  if(!inApp()&&!recent&&!fromDesktop)return;
  g={recent:recent,fromDesktop:fromDesktop,revealOnly:inApp()&&(!armed||bar.classList.contains('is-idle')),id:e.pointerId,x:e.clientX,y:e.clientY,last:e.clientY,time:performance.now(),v:0,claimed:false,dy:0};
  clearTimeout(timer);try{bar.setPointerCapture(e.pointerId);}catch(ignore){}
},true);
bar.addEventListener('pointermove',function(e){
  if(!g||g.id!==e.pointerId)return;var dy=g.y-e.clientY,dx=e.clientX-g.x,now=performance.now();
  if(!g.claimed){
    if(dy<10||dy<Math.abs(dx)*1.2)return;
    if(g.revealOnly||g.recent){}else if(g.fromDesktop){if(!HVRecentApps.begin()){g=null;show();return;}}else if(!HVDesktopHost.homeGesture.begin()){g=null;show(true);return;}
    g.claimed=true;
  }
  var dt=(now-g.time)/1000;if(dt>0)g.v=(g.last-e.clientY)/dt;g.last=e.clientY;g.time=now;g.dy=Math.max(0,dy);
  if(g.fromDesktop)HVRecentApps.move(g.dy);else if(!g.revealOnly&&!g.recent)HVDesktopHost.homeGesture.move(dx,g.dy);
  e.preventDefault();e.stopPropagation();
},{capture:true,passive:false});
function end(e,cancel){
  if(!g||g.id!==e.pointerId)return;var d=g;g=null;
  if(d.claimed){
    if(performance.now()-d.time>90)d.v=0;var commit=!cancel&&(d.dy>85||d.v>650);
    if(d.revealOnly){if(commit)show(true);else hide();}
    else if(d.fromDesktop){HVRecentApps.finish(commit);show();}
    else if(d.recent){if(commit)HVRecentApps.close();show();}
    else{if(commit)hide();HVDesktopHost.homeGesture.finish(commit);if(!commit)show(true);}
    block=Date.now()+450;e.preventDefault();e.stopPropagation();
  }else if(!inApp())show();else if(armed)show(true);
}
bar.addEventListener('pointerup',function(e){end(e,false);},true);bar.addEventListener('pointercancel',function(e){end(e,true);},true);bar.addEventListener('lostpointercapture',function(e){end(e,true);},true);
document.addEventListener('pointerdown',function(){show();},true);document.addEventListener('hv-scene-change',scene);document.addEventListener('hv-clock-controls-change',show);
window.HVHomeIndicator={show:show,scene:scene};scene();
})();
