/* Pro8 lock-screen gallery. Horizontal selection lives only inside the gallery. ES5. */
(function(){
  'use strict';
  if(/[?&]thumb=1(?:&|$)/.test(location.search))return;
  var api=window.HVClockFaces,stage=document.getElementById('stage'),KEY='homeview-design:clock-current:v2';
  var ready=false,phase='',original='',list=[],index=0,slots=[],busy=false,drag=null,holdTimer=0,holdPoint=null,blocked=0,closeTimer=0,turnTimer=0;
  var moveRAF=0,pendingX=0,cardNodes,libraryFilter='all',stageAria=null,zoom=null;
  var WIDTH=1280,HEIGHT=800,SCALE=.4,LEFT=384,TOP=232,PITCH=576,reduce=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var gallery=document.createElement('section');gallery.className='lock-gallery';gallery.hidden=true;gallery.setAttribute('role','dialog');gallery.setAttribute('aria-modal','true');gallery.setAttribute('aria-label','锁屏图库');
  gallery.innerHTML='<div class="lock-gallery-bg" aria-hidden="true"></div><div class="lock-gallery-controls"><header><button class="lock-round lock-cancel" aria-label="取消选择"><img src="/frame/hv/desktop/assets/ion-close.svg" alt=""></button><h1>屏保图库</h1><button class="lock-round lock-use" aria-label="使用此锁屏"><img src="/frame/hv/desktop/assets/ion-checkmark.svg" alt=""></button></header><div class="lock-card-zone"><button class="lock-card lock-previous" aria-label="上一个时钟样式"></button><button class="lock-card lock-selected" aria-label="使用当前时钟样式"></button><button class="lock-card lock-next" aria-label="下一个时钟样式"></button></div><button class="lock-customize" aria-label="自定义当前时钟">自定义</button><button class="lock-customize lock-customize-previous" aria-label="自定义上一个时钟">自定义</button><button class="lock-customize lock-customize-next" aria-label="自定义下一个时钟">自定义</button><div class="lock-face-name" hidden></div><button class="lock-manage" aria-label="添加或管理时钟样式"><img src="/frame/hv/desktop/assets/ion-add.svg" alt=""></button><div class="lock-gallery-dots" aria-label="时钟样式"></div><div class="lock-status" role="status"></div></div>';
  document.body.appendChild(gallery);cardNodes=gallery.querySelectorAll('.lock-card,.lock-customize');
  var manager=document.createElement('div');manager.className='clock-face-sheet';manager.hidden=true;
  manager.innerHTML='<div class="clock-face-scrim"></div><section class="clock-face-panel" role="dialog" aria-modal="true" aria-labelledby="clock-face-title"><header><h2 id="clock-face-title">添加时钟</h2><button id="clock-face-done">完成</button></header><p>轻触预览卡片，添加或移除你的时钟。</p><div class="clock-face-grid" id="clock-face-grid"></div><div class="clock-face-summary" id="clock-face-summary" role="status"></div></section>';
  document.body.appendChild(manager);manager.querySelector('.clock-face-panel').insertAdjacentHTML('beforeend',HVClockLibrary.tabs());
  function bridge(){try{return window.HVClockBridge||parent.HVClockBridge;}catch(ignore){return null;}}
  function hold(){var b=bridge();if(b){b.hold();b.clockPicker(true);}}
  function key(name){return name==='photo'?'photos':name;}
  function face(name){return name==='photos'?'photo':name;}
  function customizable(name){return name==='numerals'||name==='island'||name==='photo';}
  function enabled(){var on=HV.facesOn();return HV.FACES.filter(function(f){return on[f[0]];}).map(function(f){return face(f[0]);});}
  function label(name){for(var i=0;i<HV.FACES.length;i++)if(HV.FACES[i][0]===key(name))return HV.FACES[i][1];return name;}
  function state(name){phase=name;document.documentElement.setAttribute('data-clock-gallery',name||'closed');syncFaces();document.dispatchEvent(new CustomEvent('hv-clock-gallery-change',{detail:name||'closed'}));}
  function selected(){return list[index]||api.current().name;}
  function pauseStage(){stageAria=stage.getAttribute('aria-hidden');stage.setAttribute('aria-hidden','true');syncFaces();}
  function resumeStage(){if(stageAria==null)stage.removeAttribute('aria-hidden');else stage.setAttribute('aria-hidden',stageAria);stageAria=null;}
  function stopZoom(){if(zoom){zoom.onfinish=null;zoom.cancel();zoom=null;}}
  function zoomCard(open){stopZoom();if(reduce)return;var zone=gallery.querySelector('.lock-card-zone'),small='translateY(0) scale(1)',large='translateY(8px) scale(2.5)';try{zoom=zone.animate([{transform:open?large:small},{transform:open?small:large}],{duration:open?220:280,easing:'cubic-bezier(.333333,1,.666667,1)',fill:'both'});zoom.startTime=performance.now();if(open)zoom.onfinish=stopZoom;}catch(ignore){stopZoom();}}
  function applySelection(name){if(api.current().name===name)return;var old=api.current().element,next=api.build(name);stage.appendChild(next);api.adopt(name,next);if(old.parentNode)old.parentNode.removeChild(old);}
  function syncFaces(){if(window.HVSand)HVSand.sync();if(window.HVClockCollage)HVClockCollage.sync();if(window.HVIsland)HVIsland.motion();}
  function announce(save){var name=api.current().name;document.documentElement.setAttribute('data-current-clock',name);if(save)try{localStorage.setItem(KEY,name);}catch(ignore){}}
  function removeOthers(){var keep=api.current().element,nodes=stage.querySelectorAll('.slide');for(var i=0;i<nodes.length;i++)if(nodes[i]!==keep)nodes[i].parentNode.removeChild(nodes[i]);keep.style.left='0';keep.classList.remove('lock-neighbor');syncFaces();}
  function setTrack(x,animate){var cards=cardNodes;for(var i=0;i<cards.length;i++){cards[i].style.transition=animate&&!reduce?'transform 200ms cubic-bezier(.333333,1,.666667,1)':'none';cards[i].style.transform='translateX('+x+'px)';}}
  function controls(){
    var name=selected(),custom=gallery.querySelector('.lock-customize');custom.disabled=!customizable(name);custom.title=custom.disabled?'此样式暂无单独设置':'自定义'+label(name);var cp=gallery.querySelector('.lock-customize-previous'),cn=gallery.querySelector('.lock-customize-next');cp.hidden=index<=0;cn.hidden=index>=list.length-1;cp.disabled=!customizable(list[index-1]);cn.disabled=!customizable(list[index+1]);gallery.querySelector('.lock-face-name').textContent=label(name);
    gallery.querySelector('.lock-gallery-dots').innerHTML=list.map(function(n,i){return '<button data-lock-index="'+i+'" aria-label="选择'+HV.esc(label(n))+'时钟" aria-pressed="'+(i===index)+'"><span></span></button>';}).join('');
    gallery.querySelector('.lock-status').textContent=label(name)+'，第 '+(index+1)+' 个，共 '+list.length+' 个样式';
    gallery.querySelector('.lock-previous').disabled=index<=0;gallery.querySelector('.lock-previous').hidden=index<=0;gallery.querySelector('.lock-next').disabled=index>=list.length-1;gallery.querySelector('.lock-next').hidden=index>=list.length-1;
  }
  function thumb(name){return HVClockPreview.url(key(name));}
  function buildSlots(){
    slots=[];[-1,0,1].forEach(function(d){var b=gallery.querySelector(d<0?'.lock-previous':d>0?'.lock-next':'.lock-selected');if(index+d<0||index+d>=list.length){b.innerHTML='';return;}var name=list[index+d];HVClockPreview.render(b,key(name));b.setAttribute('data-clock-preview',name);slots.push({direction:d,name:name});});
    setTrack(0,false);controls();
  }
  function openGallery(){
    if(!ready||phase||window.HVNumerals&&HVNumerals.isOpen()||window.HVIsland&&HVIsland.isOpen()||window.HVLoungeWall&&HVLoungeWall.isOpen())return;clearTimeout(closeTimer);clearTimeout(holdTimer);holdPoint=null;original=api.current().name;list=enabled();list=list.filter(function(n){return n!==original;});list.push(original);index=list.length-1;if(original==='collage'&&window.HVClockCollage)HVClockCollage.savePreview();state('open');hold();pauseStage();removeOthers();gallery.hidden=false;gallery.classList.remove('is-editing');gallery.classList.remove('is-closing');document.documentElement.classList.add('clock-gallery-open');buildSlots();HVClockPreview.prepareCustom(function(){if(phase==='open'&&!busy)buildSlots();});
    if(list.indexOf('collage')>=0)HVClockPreview.prepare(function(){if(phase==='open'&&!busy&&!drag){var im=gallery.querySelector('[data-clock-preview="collage"] img');if(im)im.src=thumb('collage');}var option=manager.querySelector('[data-face-key="collage"]'),preview=option&&option.parentNode.querySelector('.clock-face-thumb');if(preview)preview.src=thumb('collage');});
    requestAnimationFrame(function(){if(phase!=='open')return;gallery.classList.add('is-open');zoomCard(true);gallery.setAttribute('tabindex','-1');gallery.focus();});
  }
  function closeGallery(commit){
    if(!phase||busy||phase==='editing')return;clearTimeout(holdTimer);drag=null;if(moveRAF){cancelAnimationFrame(moveRAF);moveRAF=0;}setTrack(0,false);state('closing');var target=commit?selected():original,on=enabled();if(on.indexOf(target)<0)target=on[0];
    gallery.classList.add('is-closing');zoomCard(false);
    /* Browsing never builds/adopts a live face. Do it once, behind the settled
       static fullscreen card, only when the user leaves the chooser. */
    closeTimer=setTimeout(function(){closeTimer=0;applySelection(target);removeOthers();if(commit)HV.setFace(key(target),true);announce(!!commit);stopZoom();gallery.hidden=true;gallery.classList.remove('is-open');gallery.classList.remove('is-closing');document.documentElement.classList.remove('clock-gallery-open');resumeStage();state('');var b=bridge();if(b)b.clockPicker(false);stage.setAttribute('tabindex','-1');stage.focus();},reduce?0:290);
  }
  function turn(direction,target){
    if(phase!=='open'||busy||list.length<2)return;var nextIndex=target==null?index+direction:target;if(nextIndex<0||nextIndex>=list.length||nextIndex===index){setTrack(0,true);return;}
    var b=gallery.querySelector(direction<0?'.lock-previous':'.lock-next'),im=b.querySelector('img');if(im)im.src=thumb(list[nextIndex]);
    busy=true;setTrack(-direction*PITCH,true);
    turnTimer=setTimeout(function(){turnTimer=0;index=nextIndex;buildSlots();busy=false;},reduce?0:210);
  }
  function customize(){
    if(phase!=='open'||busy||!customizable(selected()))return;if(selected()==='photo'){HV.navigate('/frame/hv/background/?target=lockscreen&return=gallery');return;}stopZoom();var editor=selected()==='island'?window.HVIsland:window.HVNumerals;if(!editor)return;state('editing');gallery.hidden=true;gallery.setAttribute('aria-hidden','true');gallery.classList.add('is-editing');editor.open({onClose:function(){state('open');gallery.hidden=false;gallery.removeAttribute('aria-hidden');gallery.classList.remove('is-editing');hold();buildSlots();gallery.querySelector('.lock-customize').focus();}});
  }
  function renderOptions(){manager.querySelector('#clock-face-grid').innerHTML=HVClockLibrary.cards(libraryFilter);HVClockPreview.hydrate(manager);manager.querySelector('#clock-face-summary').textContent='已添加 '+HVClockLibrary.count()+' 款';}
  function openPicker(){if(!phase)openGallery();if(phase!=='open')return;renderOptions();manager.hidden=false;gallery.setAttribute('aria-hidden','true');hold();manager.querySelector('#clock-face-done').focus();}
  function closePicker(){manager.hidden=true;gallery.removeAttribute('aria-hidden');if(phase==='open'){var name=selected();list=enabled();index=list.indexOf(name);if(index<0)index=0;buildSlots();gallery.querySelector('.lock-manage').focus();}}
  manager.querySelector('.clock-library-tabs').onclick=function(e){var b=e.target.closest('[data-clock-filter]');if(!b)return;libraryFilter=b.getAttribute('data-clock-filter');var all=this.querySelectorAll('button');for(var i=0;i<all.length;i++)all[i].setAttribute('aria-pressed',all[i]===b?'true':'false');renderOptions();};
  manager.querySelector('#clock-face-done').onclick=closePicker;manager.querySelector('.clock-face-scrim').onclick=closePicker;
  manager.addEventListener('change',function(e){var box=e.target.closest('[data-face-key]');if(!box)return;if(!box.checked&&enabled().length===1){box.checked=true;manager.querySelector('#clock-face-summary').textContent='请至少保留一款时钟';return;}HV.setFace(box.getAttribute('data-face-key'),box.checked);box.closest('label').classList.toggle('is-selected',box.checked);box.closest('label').querySelector('.clock-library-add').textContent=box.checked?'已添加':'添加';manager.querySelector('#clock-face-summary').textContent='已添加 '+enabled().length+' 款';});
  gallery.querySelector('.lock-cancel').onclick=function(){closeGallery(false);};gallery.querySelector('.lock-use').onclick=gallery.querySelector('.lock-selected').onclick=function(){closeGallery(true);};gallery.querySelector('.lock-customize').onclick=customize;gallery.querySelector('.lock-manage').onclick=openPicker;gallery.querySelector('.lock-customize-previous').onclick=function(){if(busy)return;turn(-1);setTimeout(customize,230);};gallery.querySelector('.lock-customize-next').onclick=function(){if(busy)return;turn(1);setTimeout(customize,230);};
  gallery.querySelector('.lock-previous').onclick=function(){turn(-1);};gallery.querySelector('.lock-next').onclick=function(){turn(1);};
  gallery.querySelector('.lock-gallery-dots').onclick=function(e){var b=e.target.closest('[data-lock-index]');if(!b)return;var target=+b.getAttribute('data-lock-index');turn(target>index?1:-1,target);};
  document.addEventListener('pointerdown',function(e){
    if(e.target.closest('.lc-editor'))return;
    if(e.button&&e.button!==0||!manager.hidden||window.HVNumerals&&HVNumerals.isOpen()||window.HVIsland&&HVIsland.isOpen()||window.HVLoungeWall&&HVLoungeWall.isOpen())return;
    if(phase==='open'){if(busy||!e.target.closest('.lock-card-zone'))return;stopZoom();drag={id:e.pointerId,x:e.clientX,y:e.clientY,lastX:e.clientX,lastTime:performance.now(),claimed:false,speed:0};return;}
    if(phase||!ready||!e.target.closest('#stage'))return;holdPoint={id:e.pointerId,x:e.clientX,y:e.clientY};clearTimeout(holdTimer);holdTimer=setTimeout(function(){if(holdPoint){openGallery();blocked=Date.now()+450;}},450);
  },true);
  document.addEventListener('pointermove',function(e){
    if(holdPoint&&e.pointerId===holdPoint.id&&Math.abs(e.clientX-holdPoint.x)+Math.abs(e.clientY-holdPoint.y)>10){clearTimeout(holdTimer);holdPoint=null;}
    if(!drag||drag.id!==e.pointerId)return;var dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(!drag.claimed){if(Math.abs(dy)>12&&Math.abs(dy)>Math.abs(dx)){drag=null;return;}if(Math.abs(dx)<10)return;drag.claimed=true;hold();try{document.documentElement.setPointerCapture(e.pointerId);}catch(ignore){}}
    var now=performance.now(),dt=(now-drag.lastTime)/1000;if(dt>0)drag.speed=drag.speed*.65+(e.clientX-drag.lastX)/dt*.35;drag.lastX=e.clientX;drag.lastTime=now;pendingX=Math.max(-PITCH,Math.min(PITCH,dx));if(index===0&&pendingX>0||index===list.length-1&&pendingX<0)pendingX*=.24;if(!moveRAF)moveRAF=requestAnimationFrame(function(){moveRAF=0;setTrack(pendingX,false);});e.preventDefault();e.stopImmediatePropagation();
  },{capture:true,passive:false});
  document.addEventListener('pointerup',function(e){clearTimeout(holdTimer);holdPoint=null;if(!drag||drag.id!==e.pointerId)return;var g=drag;drag=null;if(moveRAF){cancelAnimationFrame(moveRAF);moveRAF=0;setTrack(pendingX,false);}if(!g.claimed)return;var dx=e.clientX-g.x,speed=performance.now()-g.lastTime<90?g.speed:0;blocked=Date.now()+350;if(Math.abs(dx)>80||Math.abs(speed)>500)turn(dx<0?1:-1);else setTrack(0,true);e.preventDefault();e.stopImmediatePropagation();},true);
  document.addEventListener('pointercancel',function(){clearTimeout(holdTimer);holdPoint=null;if(moveRAF){cancelAnimationFrame(moveRAF);moveRAF=0;}if(drag){drag=null;setTrack(0,true);}},true);
  document.addEventListener('contextmenu',function(e){if(e.target.closest('#stage')){e.preventDefault();openGallery();}});
  document.addEventListener('click',function(e){if(Date.now()<blocked&&e.target.closest('.lock-card-zone')){e.preventDefault();e.stopImmediatePropagation();}},true);
  document.addEventListener('keydown',function(e){
    if(!manager.hidden){if(e.key==='Escape'){closePicker();e.preventDefault();}return;}if(phase!=='open'){if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();e.stopImmediatePropagation();}return;}
    if(e.key==='ArrowLeft'||e.key==='ArrowRight'){turn(e.key==='ArrowLeft'?-1:1);e.preventDefault();}else if(e.key==='Escape'){closeGallery(false);e.preventDefault();}else if(e.key==='Tab'){var nodes=gallery.querySelectorAll('button:not(:disabled)'),all=Array.prototype.filter.call(nodes,function(n){return n.offsetWidth||n.offsetHeight;}),first=all[0],last=all[all.length-1];if(e.shiftKey&&document.activeElement===first){last.focus();e.preventDefault();}else if(!e.shiftKey&&document.activeElement===last){first.focus();e.preventDefault();}}
  });
  function initialize(){if(ready||!api.current().element)return;ready=true;api.freeze();document.body.classList.add('clock-touch');var list=enabled(),current=api.current().name,pinned=new URLSearchParams(location.search).get('face'),saved=null;try{saved=localStorage.getItem(KEY);}catch(ignore){}if(/[?&]embeddedClock=1/.test(location.search)&&list.indexOf(saved)>=0)current=saved;if(list.indexOf(current)<0&&(!pinned||/[?&]embeddedClock=1/.test(location.search)))current=list[0]||'numerals';if(current!==api.current().name)api.render(current);announce(true);state('');if(/[?&]gallery=1(?:&|$)/.test(location.search))setTimeout(openGallery,80);}
  function reset(){clearTimeout(turnTimer);turnTimer=0;clearTimeout(closeTimer);clearTimeout(holdTimer);drag=null;holdPoint=null;busy=false;if(moveRAF)cancelAnimationFrame(moveRAF);moveRAF=0;if(window.HVIsland&&HVIsland.isOpen())HVIsland.close(false);if(window.HVLoungeWall&&HVLoungeWall.isOpen())HVLoungeWall.close(false);if(window.HVNumerals&&HVNumerals.isOpen())HVNumerals.close(false);stopZoom();manager.hidden=true;gallery.hidden=true;gallery.classList.remove('is-open');gallery.classList.remove('is-closing');gallery.classList.remove('is-editing');gallery.removeAttribute('aria-hidden');document.documentElement.classList.remove('clock-gallery-open');stage.style.transition='';stage.style.transform='';removeOthers();api.current().element.removeAttribute('aria-hidden');resumeStage();state('');var b=bridge();if(b)b.clockPicker(false);}
  function select(name){if(!ready||enabled().indexOf(name)<0)return;if(phase)reset();if(api.current().name!==name)api.render(name);announce(true);}
  document.addEventListener('hv-back',function(event){
    var editors=[window.HVIsland,window.HVLoungeWall,window.HVNumerals];for(var i=0;i<editors.length;i++)if(editors[i]&&editors[i].isOpen()){editors[i].close(false);event.preventDefault();return;}
    if(!manager.hidden){closePicker();event.preventDefault();}else if(phase){if(phase==='open')closeGallery(false);event.preventDefault();}
  });
  function refreshPreviews(){if(phase==='open'&&!busy)buildSlots();if(!manager.hidden)renderOptions();}
  document.addEventListener('ha-wallpaper-change',refreshPreviews);window.addEventListener('storage',function(e){if(['homeview:island:v1','homeview:clock-numerals:v1','hv-app-wall:lockscreen'].indexOf(e.key)>=0)refreshPreviews();});
  var galleryAPI={refreshPreviews:refreshPreviews,openGallery:openGallery,openPicker:openPicker,closePicker:closePicker,select:select,isOpen:function(){return !!phase;}};window.HVClockGallery=galleryAPI;window.HVClockCarousel=galleryAPI;
  window.addEventListener('storage',function(e){if(e.key==='hv-faces'||e.key===KEY){var list=enabled(),saved=localStorage.getItem(KEY);select(list.indexOf(saved)>=0?saved:list[0]);}});
  document.addEventListener('hv-clock-ready',initialize);initialize();
})();
