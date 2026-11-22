/* Clock-only horizontal gesture and checked-face gallery. Shares vertical motion without moving backgrounds. */
(function(){
  'use strict';
  if(/[?&]thumb=1(?:&|$)/.test(location.search))return;
  var api=window.HVClockFaces,stage=document.getElementById('stage'),body=document.body;
  var ready=false,pair=null,q=0,velocity=0,target=0,raf=0,last=0,settleFrom=0,drag=null,holdTimer=0,blockedUntil=0;
  var DISTANCE=240,KEY='homeview-design:clock-current:v2',reduce=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches,returnFocus=null;
  var dots=document.createElement('div');dots.className='clock-face-dots';dots.setAttribute('aria-hidden','true');stage.appendChild(dots);
  var sheet=document.createElement('div');sheet.className='clock-face-sheet';sheet.hidden=true;
  sheet.innerHTML='<div class="clock-face-scrim"></div><section class="clock-face-panel" role="dialog" aria-modal="true" aria-labelledby="clock-face-title"><header><h2 id="clock-face-title">展示的时钟</h2><div><button id="clock-face-wallpaper">锁屏壁纸</button><button id="clock-face-done">完成</button></div></header><p>勾选喜欢的样式，左右滑动时只展示这些时钟。</p><div class="clock-face-grid" id="clock-face-grid"></div><div class="clock-face-summary" id="clock-face-summary" role="status"></div></section>';
  body.appendChild(sheet);
  function bridge(){try{return window.HVClockBridge||parent.HVClockBridge;}catch(ignore){return null;}}
  function holdBridge(){var b=bridge();if(b)b.hold();}
  function keyName(name){return name==='photo'?'photos':name;}
  function faceName(key){return key==='photos'?'photo':key;}
  function enabled(){var on=HV.facesOn();return HV.FACES.filter(function(f){return on[f[0]];}).map(function(f){return faceName(f[0]);});}
  function label(name){var key=keyName(name);for(var i=0;i<HV.FACES.length;i++)if(HV.FACES[i][0]===key)return HV.FACES[i][1];return name;}
  function announce(){var list=enabled(),current=api.current().name;document.documentElement.setAttribute('data-current-clock',current);dots.innerHTML=list.map(function(name){return '<span'+(name===current?' class="active"':'')+'></span>';}).join('');try{localStorage.setItem(KEY,current);}catch(ignore){}}
  function foreground(slide){return Array.prototype.slice.call(slide.children).filter(function(el){return !/^(IMG|VIDEO)$/.test(el.tagName)&&!/(^|\s)(art|bgfall|bg|shade|shade-b)(\s|$)/.test(el.getAttribute('class')||'');});}
  function moveContent(slide,x){if(reduce)x=0;foreground(slide).forEach(function(el){if(typeof el.hvSceneBaseTransform==='undefined'){var t=getComputedStyle(el).transform;el.hvSceneBaseTransform=t==='none'?'':t;}el.hvClockX=x;el.style.transform='translate3d('+x+'px,'+(el.hvClockY||0)+'px,0) '+el.hvSceneBaseTransform;el.style.willChange='transform';});}
  function paint(){if(!pair)return;var t=Math.max(0,Math.min(1,q));pair.out.style.opacity=String(1-t);pair.incoming.style.opacity=String(t);moveContent(pair.out,pair.direction*t*DISTANCE);moveContent(pair.incoming,-pair.direction*(1-t)*DISTANCE);}
  function finish(commit){
    if(!pair)return;if(raf)cancelAnimationFrame(raf);raf=0;
    var keep=commit?pair.incoming:pair.out,remove=commit?pair.out:pair.incoming,name=commit?pair.name:pair.original;
    moveContent(keep,0);keep.style.opacity='1';keep.classList.add('on');if(remove.parentNode)remove.parentNode.removeChild(remove);
    api.adopt(name,keep);stage.style.background=getComputedStyle(keep).backgroundColor;pair=null;q=0;velocity=0;announce();
  }
  function step(now){var t=Math.max(0,Math.min(1,(now-last)/220));q=settleFrom+(target-settleFrom)*(1-Math.pow(1-t,3));paint();if(t>=1){finish(target===1);return;}raf=requestAnimationFrame(step);}
  function settle(next,speed){if(!pair)return;if(raf)cancelAnimationFrame(raf);target=next;velocity=0;settleFrom=q;last=performance.now();if(reduce){finish(target===1);return;}raf=requestAnimationFrame(step);}
  function prepare(direction){
    if(pair&&pair.direction===direction)return true;
    if(pair)finish(false);
    var list=enabled(),current=api.current(),index=list.indexOf(current.name);
    if(list.length<2)return false;
    if(index<0)index=0;var name=list[(index+(direction<0?1:-1)+list.length)%list.length],incoming=api.build(name);
    incoming.style.transition='none';incoming.style.opacity='0';incoming.classList.add('on');current.element.style.transition='none';
    stage.style.background=getComputedStyle(current.element).backgroundColor;stage.appendChild(incoming);
    pair={out:current.element,incoming:incoming,name:name,original:current.name,direction:direction};q=0;paint();return true;
  }
  function renderOptions(){
    var on=HV.facesOn();document.getElementById('clock-face-grid').innerHTML=HV.FACES.map(function(f){var yes=!!on[f[0]];return '<label class="clock-face-option'+(yes?' is-selected':'')+'"><input type="checkbox" data-face-key="'+f[0]+'"'+(yes?' checked':'')+'><img class="clock-face-thumb" src="/frame/hv/faces/thumbs/'+f[0]+'.jpg" alt="'+HV.esc(f[1])+'表盘"><span class="clock-face-check"><img src="/frame/hv/desktop/assets/ion-checkmark.svg" alt=""></span><b>'+HV.esc(f[1])+'</b><small>'+HV.esc(f[2])+'</small></label>';}).join('');
    document.getElementById('clock-face-summary').textContent='已选择 '+enabled().length+' 款 · 至少保留一款时钟';
  }
  function openPicker(){if(!ready)return;clearTimeout(holdTimer);drag=null;if(pair)finish(q>=.5);holdBridge();returnFocus=document.activeElement;renderOptions();sheet.hidden=false;var b=bridge();if(b)b.clockPicker(true);document.getElementById('clock-face-done').focus();}
  function closePicker(){sheet.hidden=true;var b=bridge();if(b)b.clockPicker(false);if(returnFocus&&returnFocus!==body)returnFocus.focus();else{stage.setAttribute('tabindex','-1');stage.focus();}}
  document.getElementById('clock-face-wallpaper').onclick=function(){closePicker();HV.navigate('/frame/hv/background/?target=lockscreen');};
  document.getElementById('clock-face-done').onclick=closePicker;sheet.querySelector('.clock-face-scrim').onclick=closePicker;
  sheet.addEventListener('change',function(e){var box=e.target.closest('[data-face-key]');if(!box)return;var key=box.getAttribute('data-face-key'),list=enabled();if(!box.checked&&list.length===1){box.checked=true;document.getElementById('clock-face-summary').textContent='请至少保留一款时钟';return;}HV.setFace(key,box.checked);box.closest('label').classList.toggle('is-selected',box.checked);list=enabled();if(list.indexOf(api.current().name)<0){var old=api.current().element,newFace=api.build(list[0]);newFace.classList.add('on');newFace.style.opacity='1';stage.appendChild(newFace);if(old.parentNode)old.parentNode.removeChild(old);api.adopt(list[0],newFace);}announce();document.getElementById('clock-face-summary').textContent='已选择 '+list.length+' 款 · 至少保留一款时钟';});
  function start(e){
    if(!ready||!sheet.hidden||e.button&&e.button!==0||!e.target.closest('#stage'))return;
    blockedUntil=0;var currentOffset=pair?pair.direction*q*DISTANCE:0,resume=target;
    if(raf)cancelAnimationFrame(raf);raf=0;
    drag={id:e.pointerId,x:e.clientX,y:e.clientY,lastX:e.clientX,lastTime:performance.now(),startMotion:currentOffset,claimed:false,speed:0,resume:resume};
    holdTimer=setTimeout(function(){if(drag&&!drag.claimed){openPicker();blockedUntil=Date.now()+400;}},450);
  }
  function move(e){
    var g=drag;if(!g||g.id!==e.pointerId)return;var dx=e.clientX-g.x,dy=e.clientY-g.y;
    if(!g.claimed){if(Math.abs(dx)+Math.abs(dy)>10)clearTimeout(holdTimer);if(Math.abs(dy)>10&&Math.abs(dy)>Math.abs(dx)*1.2){drag=null;if(pair)settle(g.resume,velocity);return;}if(Math.abs(dx)<10)return;g.claimed=true;holdBridge();try{document.documentElement.setPointerCapture(e.pointerId);}catch(ignore){}}
    var motion=g.startMotion+dx,direction=motion<0?-1:1;if(!prepare(direction))return;
    var now=performance.now(),dt=(now-g.lastTime)/1000;if(dt>0)g.speed=(e.clientX-g.lastX)/DISTANCE/dt;
    g.lastX=e.clientX;g.lastTime=now;q=Math.min(1,Math.abs(motion)/DISTANCE);blockedUntil=Date.now()+400;paint();e.preventDefault();e.stopImmediatePropagation();
  }
  function end(e){
    var g=drag;if(!g||g.id!==e.pointerId)return;clearTimeout(holdTimer);drag=null;
    if(!g.claimed){if(pair)settle(g.resume,velocity);return;}
    if(!pair)return;if(performance.now()-g.lastTime>90)g.speed=0;
    var speed=g.speed*pair.direction,next=q+speed*.13>.5?1:0;if(speed>1.2)next=1;else if(speed<-1.2)next=0;
    blockedUntil=Date.now()+400;settle(next,speed);e.preventDefault();e.stopImmediatePropagation();
  }
  document.addEventListener('pointerdown',start,true);document.addEventListener('pointermove',move,{capture:true,passive:false});document.addEventListener('pointerup',end,true);
  document.addEventListener('pointercancel',function(){clearTimeout(holdTimer);drag=null;if(pair)settle(q>.5?1:0,0);},true);
  document.addEventListener('dragstart',function(e){if(drag)e.preventDefault();},true);
  document.addEventListener('click',function(e){if(blockedUntil>Date.now()&&sheet.hidden){e.preventDefault();e.stopImmediatePropagation();}},true);
  document.addEventListener('contextmenu',function(e){if(e.target.closest('#stage')){e.preventDefault();openPicker();}});
  document.addEventListener('keydown',function(e){if(!sheet.hidden){if(e.key==='Escape'){closePicker();e.preventDefault();}else if(e.key==='Tab'){var nodes=sheet.querySelectorAll('button,input'),first=nodes[0],lastNode=nodes[nodes.length-1];if(e.shiftKey&&document.activeElement===first){lastNode.focus();e.preventDefault();}else if(!e.shiftKey&&document.activeElement===lastNode){first.focus();e.preventDefault();}}return;}if(e.key==='ArrowLeft'||e.key==='ArrowRight'){holdBridge();if(prepare(e.key==='ArrowLeft'?-1:1))settle(1,0);e.preventDefault();}});
  function initialize(){if(ready||!api.current().element)return;ready=true;api.freeze();body.classList.add('clock-touch');var list=enabled(),current=api.current().name,saved=null;try{saved=localStorage.getItem(KEY);}catch(ignore){}if(/[?&]embeddedClock=1/.test(location.search)&&list.indexOf(saved)>=0)current=saved;if(list.indexOf(current)<0)current=list[0]||'numerals';if(current!==api.current().name)api.render(current);announce();}
  function select(name){if(!ready||enabled().indexOf(name)<0)return;if(pair)finish(false);if(api.current().name!==name)api.render(name);announce();}
  window.HVClockCarousel={openPicker:openPicker,closePicker:closePicker,select:select};
  window.addEventListener('storage',function(e){if(e.key==='hv-faces'||e.key===KEY){var list=enabled(),saved=localStorage.getItem(KEY);select(list.indexOf(saved)>=0?saved:list[0]);}});
  document.addEventListener('hv-clock-ready',initialize);initialize();
})();
