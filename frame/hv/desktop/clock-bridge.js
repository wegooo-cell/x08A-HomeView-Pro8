/* Pro 8: stationary clock/desktop dissolve, driven by a reversible vertical gesture. ES5. */
(function(){
  'use strict';
  if(/[?&](?:thumb|embedded|embeddedClock)=1(?:&|$)/.test(location.search))return;
  var body=document.body,isClock=body.classList.contains('sb'),clock,desktop,frame;
  var clockDocument=isClock?document:null,desktopMotion=isClock?null:document.querySelector('.desktop-content');
  var p=isClock?0:1,target=p,v=0,raf=0,last=0,gesture=null,settleFrom=p;
  var TRAVEL=240,WIDTH=1280,HEIGHT=800;
  var reduced=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  body.classList.add('pro8-scene');
  frame=document.createElement('iframe');frame.className='scene-frame';frame.width=WIDTH;frame.height=HEIGHT;
  if(isClock){clock=document.getElementById('stage');desktop=frame;frame.title='HomeView 主屏幕';frame.src='/frame/hv/?embedded=1&v=desktop4';}
  else{desktop=document.getElementById('desktop-canvas');clock=frame;frame.title='HomeView 时钟';frame.src='/frame/hv/standby/?face=numerals&tone=blue&embeddedClock=1&v=desktop4';}
  clock.classList.add('scene-clock');desktop.classList.add('scene-desktop');body.appendChild(frame);
  var picker=document.createElement('a');picker.className='clock-face-picker';picker.href='/frame/hv/faces/';picker.textContent='选择表盘';body.appendChild(picker);picker.style.display='none';
  function moveClockContent(amount){
    if(!clockDocument)return;
    var slides=clockDocument.querySelectorAll('#stage .slide');
    for(var i=0;i<slides.length;i++)for(var j=0;j<slides[i].children.length;j++){
      var el=slides[i].children[j];
      if(/^(IMG|VIDEO)$/.test(el.tagName)||/(^|\s)(art|bgfall|bg|shade|shade-b)(\s|$)/.test(el.getAttribute('class')||''))continue;
      if(typeof el.hvSceneBaseTransform==='undefined'){
        var original=clockDocument.defaultView.getComputedStyle(el).transform;
        el.hvSceneBaseTransform=original==='none'?'':original;
      }
      el.hvClockY=amount;
      el.style.transform=(reduced?'':'translate3d('+(el.hvClockX||0)+'px,'+amount+'px,0) ')+el.hvSceneBaseTransform;
      el.style.willChange=p>.001&&p<.999?'transform':'';
    }
  }
  function paint(){
    var x=Math.max(0,Math.min(1,p)),dragClock=gesture&&gesture.source.kind==='clock';
    // Wallpaper and face backgrounds stay anchored. Move only the clock marks and desktop content.
    moveClockContent(-x*TRAVEL);
    if(desktopMotion)desktopMotion.style.transform=reduced?'none':'translate3d(0,'+((1-x)*TRAVEL)+'px,0)';
    clock.style.opacity=String(1-x);clock.style.visibility=x<.999||dragClock?'visible':'hidden';
    var claimed=gesture&&gesture.claimed;
    clock.style.pointerEvents=claimed?(gesture.source.kind==='clock'?'auto':'none'):(x<.5?'auto':'none');
    desktop.style.pointerEvents=claimed?(gesture.source.kind==='desktop'?'auto':'none'):(x>=.5?'auto':'none');
    clock.setAttribute('aria-hidden',x>=.999?'true':'false');desktop.setAttribute('aria-hidden',x<=.001?'true':'false');
    picker.style.opacity=String(Math.max(0,1-x*3));picker.style.visibility=x>.33?'hidden':'visible';
    frame.setAttribute('tabindex',(isClock?x>=.999:x<=.001)?'0':'-1');
    document.documentElement.setAttribute('data-clock-progress',x.toFixed(3));
    var scene=x<=.001?'clock':x>=.999?'desktop':'dissolving';
    if(document.documentElement.getAttribute('data-scene')!==scene){document.documentElement.setAttribute('data-scene',scene);document.dispatchEvent(new CustomEvent('hv-scene-change'));}
  }
  function step(now){
    var t=Math.max(0,Math.min(1,(now-last)/220)),q=1-Math.pow(1-t,3);
    p=settleFrom+(target-settleFrom)*q;
    if(t>=1){p=target;v=0;raf=0;paint();return;}
    paint();raf=requestAnimationFrame(step);
  }
  function settle(next,velocity){
    if(raf)cancelAnimationFrame(raf);raf=0;target=next;v=0;
    if(Math.abs(next-p)<.001||reduced){p=target;paint();return;}
    settleFrom=p;last=performance.now();raf=requestAnimationFrame(step);
  }
  window.HVClockBridge={isDragging:function(){return !!(gesture&&gesture.claimed);},open:function(){gesture=null;settle(1,0);},close:function(){gesture=null;settle(0,0);},hold:function(){gesture=null;},clockPicker:function(open){gesture=null;picker.hidden=true;document.documentElement.classList.toggle('clock-controls-open',!!open);document.dispatchEvent(new CustomEvent('hv-clock-controls-change'));}};
  picker.onclick=function(e){if(clockDocument&&clockDocument.defaultView.HVClockCarousel){e.preventDefault();clockDocument.defaultView.HVClockCarousel.openPicker();}};
  function modalOpen(doc){return doc.documentElement.classList.contains('clock-gallery-open')||doc.documentElement.classList.contains('num-editing')||doc.documentElement.classList.contains('native-app-open')||doc.documentElement.classList.contains('layout-editing')||!!doc.querySelector('.desktop-modal:not([hidden]),.clock-face-sheet:not([hidden]),.hv-sheet.on,.cm-modal.on,.cm-library.on');}
  function bind(doc,kind,surface){
    var source={doc:doc,kind:kind,surface:surface,blockClickUntil:0};
    function point(e){var rect=source.doc===document?{left:0,top:0}:source.surface.getBoundingClientRect();return {x:e.clientX+rect.left,y:e.clientY+rect.top};}
    function down(e){
      source.blockClickUntil=0;
      if(e.button&&e.button!==0||modalOpen(doc)||e.target.closest('input,textarea,select,[role="slider"],[data-seek],.clock-face-picker'))return;
      var pos=point(e);
      gesture={source:source,id:e.pointerId,startX:pos.x,startY:pos.y,lastY:pos.y,lastTime:performance.now(),startP:Math.max(0,Math.min(1,p)),claimed:false,velocity:0};
    }
    function move(e){
      var g=gesture;if(!g||g.source!==source||g.id!==e.pointerId)return;
      var pos=point(e),dy=pos.y-g.startY,dx=pos.x-g.startX,now=performance.now();
      if(!g.claimed){
        if(Math.abs(dx)>10&&Math.abs(dx)>Math.abs(dy)*1.2){gesture=null;return;}
        if(Math.abs(dy)<10)return;
        if(g.startP<=.001&&dy>0||g.startP>=.999&&dy<0){gesture=null;return;}
        g.claimed=true;if(raf)cancelAnimationFrame(raf);raf=0;
        try{doc.documentElement.setPointerCapture(e.pointerId);}catch(ignore){}
      }
      var dt=(now-g.lastTime)/1000;
      if(dt>0)g.velocity=(g.lastY-pos.y)/TRAVEL/dt;
      p=Math.max(0,Math.min(1,g.startP-dy/TRAVEL));g.lastY=pos.y;g.lastTime=now;
      source.blockClickUntil=Date.now()+400;paint();e.preventDefault();e.stopPropagation();
    }
    function up(e){
      var g=gesture;if(!g||g.source!==source||g.id!==e.pointerId)return;
      gesture=null;
      if(!g.claimed)return;
      if(performance.now()-g.lastTime>90)g.velocity=0;
      var next=p+g.velocity*.13>.5?1:0;
      if(g.velocity>1.2)next=1;else if(g.velocity<-1.2)next=0;
      source.blockClickUntil=Date.now()+400;settle(next,g.velocity);e.preventDefault();e.stopPropagation();
    }
    doc.addEventListener('pointerdown',down,true);doc.addEventListener('pointermove',move,{capture:true,passive:false});doc.addEventListener('pointerup',up,true);
    doc.addEventListener('dragstart',function(e){if(gesture&&gesture.source===source)e.preventDefault();},true);
    doc.addEventListener('pointercancel',function(e){if(!gesture||gesture.source!==source||gesture.id!==e.pointerId)return;var initial=gesture.startP;gesture=null;settle(initial>.5?1:0,0);},true);
    doc.addEventListener('click',function(e){if(Date.now()<source.blockClickUntil){e.preventDefault();e.stopImmediatePropagation();}},true);
    doc.addEventListener('wheel',function(e){if(modalOpen(doc)||Math.abs(e.deltaY)<15)return;if(e.deltaY>0&&p<.999){e.preventDefault();settle(1,0);}else if(e.deltaY<0&&p>.001){e.preventDefault();settle(0,0);}},{passive:false});
    doc.addEventListener('keydown',function(e){if(modalOpen(doc)||e.target.closest('input,textarea,select'))return;if(e.key==='ArrowUp'&&p<.999){e.preventDefault();settle(1,0);}else if(e.key==='ArrowDown'&&p>.001){e.preventDefault();settle(0,0);}});
  }
  bind(document,isClock?'clock':'desktop',isClock?clock:desktop);
  frame.addEventListener('load',function(){
    try{var doc=frame.contentDocument;
      // Existing app screens retain their own scroll and drag interactions.
      if(isClock&&!doc.getElementById('desktop-canvas'))return;
      if(isClock)desktopMotion=doc.querySelector('.desktop-content');else clockDocument=doc;
      bind(doc,isClock?'desktop':'clock',frame);paint();
    }catch(ignore){}
  });
  window.addEventListener('message',function(e){if(e.origin===location.origin&&e.source===frame.contentWindow&&e.data&&e.data.type==='hv-desktop:clock')settle(0,0);});
  paint();
})();
