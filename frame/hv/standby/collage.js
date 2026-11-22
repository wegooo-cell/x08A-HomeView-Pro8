/* macOS-inspired album collage. 28 small tiles; only the visible face owns motion. ES5. */
(function(){'use strict';
var KEY='homeview:clock-cover-art:v1',DAYS=['星期日','星期一','星期二','星期三','星期四','星期五','星期六'];
var owner=null,timer=0,finishTimer=0,flip=null,drift=null,lastSpot=-1;
/* A closed path never stops at a turnaround. Cache the keyframes once; the
   compositor interpolates them, with no JavaScript work on animation frames. */
var DRIFT_MS=24000,DRIFT_STEPS=128,driftFrames=[],driftPoints=[];
for(var di=0;di<=DRIFT_STEPS;di++){
 var angle=(di===DRIFT_STEPS?0:di)*Math.PI*2/DRIFT_STEPS;
 var point={x:Math.round(Math.cos(angle)*84*1000)/1000,y:Math.round(Math.sin(angle)*24*1000)/1000};
 driftPoints.push(point);driftFrames.push({transform:pose(point.x,point.y),offset:di/DRIFT_STEPS});
}
function pose(x,y){return 'translate3d('+x+'px,'+y+'px,0) scale(1.08)';}
function pointAt(ms){var pos=(ms%DRIFT_MS)/DRIFT_MS*DRIFT_STEPS,i=Math.floor(pos),f=pos-i,a=driftPoints[i],b=driftPoints[i+1];return {x:a.x+(b.x-a.x)*f,y:a.y+(b.y-a.y)*f};}
function frozenPose(ms){var p=pointAt(ms);return pose(p.x,p.y);}
function savePreview(d){
 if(!window.HVClockPreview||!d||!d._collage||!d._collage.arts.length)return;
 var s=d._collage,tiles=s.grid.children,images=[],loaded=0;
 for(var i=0;i<tiles.length;i++){
  var im=tiles[i].firstChild.firstChild;
  if(flip&&flip.tile===tiles[i]&&flip.animation.effect&&flip.animation.effect.getComputedTiming&&flip.animation.effect.getComputedTiming().progress>=.5)im=flip.back;
  var real=im.complete&&im.naturalWidth&&im.src.indexOf('/api/frame/netease/art?')>=0;
  images.push(real?im:null);if(real)loaded++;
 }
 if(!loaded)return;
 var ms=owner===d&&drift&&typeof drift.currentTime==='number'?Math.max(0,drift.currentTime):s.phase;
 window.HVClockPreview.capture(images,pointAt(ms));
}
var media=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)');
function current(){var c=window.HVClockFaces&&window.HVClockFaces.current(),d=c&&c.element;
 var stage=document.getElementById('stage'),gallery=document.documentElement.getAttribute('data-clock-gallery');
 return d&&d._collage&&d.classList.contains('on')&&d.getAttribute('aria-hidden')!=='true'&&(!stage||stage.getAttribute('aria-hidden')!=='true')&&(!gallery||gallery==='closed')&&HV.canWork()&&!(media&&media.matches)?d:null;
}
function finish(){clearTimeout(finishTimer);finishTimer=0;if(!flip)return;var f=flip;flip=null;
 f.front.src=f.back.src;f.turn.removeChild(f.back);if(f.animation)f.animation.cancel();f.turn.style.willChange='';f.tile.classList.remove('cc-flipping');
 f.root._collage.flips++;f.root.setAttribute('data-collage-flips',f.root._collage.flips);
}
function stop(){clearTimeout(timer);timer=0;if(owner)savePreview(owner);finish();
 if(owner){var s=owner._collage;if(drift&&typeof drift.currentTime==='number')s.phase=Math.max(0,drift.currentTime)%DRIFT_MS;
  /* Preserve the precise position when hidden or entering the gallery. */
  s.grid.style.transform=frozenPose(s.phase);s.grid.style.willChange='';
 }if(drift)drift.cancel();drift=null;owner=null;
}
function schedule(){timer=setTimeout(turn,6200+Math.floor(Math.random()*2800));}
function turn(){timer=0;if(current()!==owner){syncMotion();return;}var s=owner._collage,tiles=s.grid.children;
 if(s.arts.length<2||!tiles.length){schedule();return;}
 var index=Math.floor(Math.random()*tiles.length);if(index===lastSpot)index=(index+9)%tiles.length;lastSpot=index;
 var tile=tiles[index],t=tile.firstChild,front=t.firstChild,loaded=[];
 for(var i=0;i<tiles.length;i++){var im=tiles[i].firstChild.firstChild;if(im.complete&&im.naturalWidth&&im.src!==front.src&&im.src.indexOf('/api/frame/netease/art?')>=0)loaded.push(im);}
 if(!loaded.length){schedule();return;}var next=loaded[Math.floor(Math.random()*loaded.length)];
 var back=document.createElement('img');back.className='cc-back';back.alt='';back.src=next.src;back.draggable=false;
 /* Reuse an already loaded 192px cover. Never wait for a new API request in a flip. */
 tile.classList.add('cc-flipping');t.appendChild(back);t.style.willChange='transform';
 try{var a=t.animate([{transform:'rotateY(0deg)'},{transform:'rotateY(180deg)'}],{duration:1100,easing:'cubic-bezier(.333333,1,.666667,1)',fill:'both'});
  /* WebView72 can leave auto-started 3D animations pending. Match the clock's explicit timebase. */
  a.startTime=performance.now();
  flip={root:owner,tile:tile,turn:t,front:front,back:back,animation:a};finishTimer=setTimeout(function(){finish();syncMotion();},1160);
 }catch(ignore){t.removeChild(back);t.style.willChange='';tile.classList.remove('cc-flipping');}
 schedule();
}
function syncMotion(){var d=current();if(d!==owner){stop();if(!d)return;owner=d;
  var s=d._collage;s.grid.style.transform=frozenPose(s.phase);s.grid.style.willChange='transform';
  try{drift=s.grid.animate(driftFrames,{duration:DRIFT_MS,iterations:Infinity,easing:'linear'});drift.startTime=performance.now()-s.phase;}catch(ignore){s.grid.style.willChange='';}
 }if(owner&&!timer&&!flip)schedule();}
function safe(u){return typeof u==='string'&&/^https?:\/\/[a-z0-9.-]+\.music\.126\.net\//i.test(u);}
function host(){try{return window.HVDesktopHost||parent!==window&&parent.HVDesktopHost;}catch(ignore){return null;}}
function covers(){var h=host(),s=h&&h.state()||{},a=s.coverArt||[],out=[],seen={};
 if(!a.length)try{a=JSON.parse(localStorage.getItem(KEY)||'[]');}catch(ignore){}if(!Array.isArray(a))a=[];
 a.forEach(function(u){if(safe(u)&&!seen[u]&&out.length<28){seen[u]=true;out.push(u);}});
 if(!out.length&&s.nearby)s.nearby.forEach(function(x){var u=x.track&&x.track.art;if(safe(u)&&!seen[u]){seen[u]=true;out.push(u);}});
 if(!out.length&&s.track&&safe(s.track.art))out.push(s.track.art);return out;
}
function proxy(u){return '/api/frame/netease/art?size=192&url='+encodeURIComponent(u);}
function build(){var d=document.createElement('div');d.className='slide f-collage';
 d.innerHTML='<div class="cc-grid" aria-hidden="true"></div><div class="cc-dim" aria-hidden="true"></div><section class="cc-clock"><div class="cc-date"></div><time></time></section><p class="cc-empty" hidden>打开音乐，展示你的专辑封面</p>';
 var lastArt='',lastMinute='',grid=d.querySelector('.cc-grid');d._collage={grid:grid,arts:[],flips:0,phase:0};
 function sync(){var t=HV.local(),minute=t.y+'-'+t.mo+'-'+t.d+'-'+t.h+'-'+t.mi;
  if(minute!==lastMinute){lastMinute=minute;d.querySelector('time').textContent=HV.pad(t.h)+':'+HV.pad(t.mi);d.querySelector('.cc-date').textContent=t.mo+'月'+t.d+'日 '+DAYS[t.dow];}
  var a=covers(),key=JSON.stringify(a);if(key===lastArt){syncMotion();return;}lastArt=key;if(owner===d)stop();d._collage.arts=a;
  var html='',fallback='/frame/hv/desktop/assets/public-music.svg';for(var i=0;i<28;i++)html+='<div class="cc-tile"><div class="cc-turn"><img src="'+HV.esc(a.length?proxy(a[i%a.length]):fallback)+'" alt="" decoding="async" draggable="false"></div></div>';
  grid.innerHTML=html;d.querySelector('.cc-empty').hidden=!!a.length;d.classList.toggle('cc-no-art',!a.length);
  var images=grid.querySelectorAll('img'),remaining=images.length;
  function loaded(){if(!--remaining&&lastArt===key&&current()===d)savePreview(d);}
  for(var j=0;j<images.length;j++){images[j].onload=loaded;images[j].onerror=function(){this.onerror=null;this.onload=null;this.src=fallback;loaded();};if(images[j].complete&&images[j].naturalWidth){images[j].onload=null;loaded();}}
  syncMotion();
 }
 d.tick=sync;d.fast=true;sync();return d;
}
document.addEventListener('visibilitychange',syncMotion);document.addEventListener('hv-work-change',syncMotion);document.addEventListener('hv-clock-ready',syncMotion);
window.addEventListener('pagehide',stop);if(media&&media.addListener)media.addListener(syncMotion);
window.HVClockCollage={build:build,sync:syncMotion,savePreview:function(){var c=window.HVClockFaces&&window.HVClockFaces.current();if(!owner)savePreview(c&&c.element);},stats:function(){return {running:!!owner,flipping:!!flip,flips:owner?owner._collage.flips:0,timers:(timer?1:0)+(finishTimer?1:0),tiles:28};}};})();
