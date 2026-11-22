/* Real clock UI: cached engraved glyphs + rotating restoration mask + bounded sand ridge. ES5. */
(function(){
  'use strict';
  var N=768,C=N/2,atlas=null,wipe=null,atlasURL='',wipeURL='',owner=null,timer=0,raf=0,last=0,FRAME=1000/30,GRAIN_MS=1000/12;
  var reduce=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(reduce)FRAME=1000;
  function canvas(w,h){var c=document.createElement('canvas');c.width=w;c.height=h;return c;}
  function smooth(x){x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);}
  function noise(i,t){var n=Math.sin(i*73.156+t*19.17)*43758.5453;return n-Math.floor(n);}
  function makeAtlas(){
    if(atlas)return;var mask=canvas(N,N),m=mask.getContext('2d');m.fillStyle='#fff';m.font='400 116px "HomeView Sans", sans-serif';m.textAlign='center';m.textBaseline='middle';
    for(var n=1;n<=12;n++){
      var angle=n*Math.PI/6,rotation=((n*30+90)%180)-90;if(rotation===-90)rotation=n===9?-90:90;
      m.save();m.translate(C+Math.sin(angle)*286,C-Math.cos(angle)*286);m.rotate(rotation*Math.PI/180);m.fillText(String(n),0,-11);m.restore();
    }
    var src=m.getImageData(0,0,N,N).data,blur=new Float32Array(N*N),x,y,i;
    for(y=1;y<N-1;y++)for(x=1;x<N-1;x++){var sum=0;for(var yy=-1;yy<=1;yy++)for(var xx=-1;xx<=1;xx++)sum+=src[((y+yy)*N+x+xx)*4+3]*(xx===0?2:1)*(yy===0?2:1);blur[y*N+x]=sum/16;}
    atlas=canvas(N,N);var a=atlas.getContext('2d'),img=a.createImageData(N,N),dst=img.data;
    for(y=2;y<N-2;y++)for(x=2;x<N-2;x++){
      i=y*N+x;var dx=(blur[i+1]-blur[i-1])*.5,dy=(blur[i+N]-blur[i-N])*.5,shade=-(dx+dy)*.71,edge=Math.min(shade<0?.82:.6,Math.abs(shade)/(shade<0?105:150)),at=i*4;
      if(Math.abs(shade)>1){dst[at]=shade<0?118:255;dst[at+1]=shade<0?87:245;dst[at+2]=shade<0?43:207;dst[at+3]=Math.round(edge*255);}
      else if(blur[i]>15){dst[at]=153;dst[at+1]=121;dst[at+2]=67;dst[at+3]=Math.round(blur[i]*.035);}
    }
    a.putImageData(img,0,0);
    wipe=canvas(N,N);var w=wipe.getContext('2d'),wi=w.createImageData(N,N),wd=wi.data;
    for(y=0;y<N;y++)for(x=0;x<N;x++){
      var ang=Math.atan2(x-C,C-y)*180/Math.PI;if(ang<0)ang+=360;var behind=(360-ang)%360,opacity=behind>355?1-smooth((behind-355)/5):smooth((behind-5)/108);i=(y*N+x)*4;wd[i]=wd[i+1]=wd[i+2]=255;wd[i+3]=Math.round(opacity*255);
    }
    w.putImageData(wi,0,0);atlasURL=atlas.toDataURL("image/png");wipeURL=wipe.toDataURL("image/png");
  }
  function roundRect(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}
  function handSprite(kind){
    var minute=kind==='minute',c=canvas(96,minute?420:300),ctx=c.getContext('2d'),origin=minute?370:250,tip=minute?34:52,height=minute?288:148;
    ctx.strokeStyle='#81612f';ctx.lineWidth=4.8;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(48,origin);ctx.lineTo(48,origin-60);ctx.stroke();
    ctx.save();ctx.shadowColor='rgba(77,53,20,.28)';ctx.shadowBlur=11;ctx.shadowOffsetX=6;ctx.shadowOffsetY=7;roundRect(ctx,34,tip,28,height,14);ctx.fillStyle='#7d5d32';ctx.fill();ctx.restore();
    var grad=ctx.createLinearGradient(32,0,64,0);grad.addColorStop(0,'#ae8b50');grad.addColorStop(.16,'#8e6a39');grad.addColorStop(.55,'#76562f');grad.addColorStop(1,'#61472a');roundRect(ctx,34,tip,28,height,14);ctx.fillStyle=grad;ctx.fill();ctx.lineWidth=.9;ctx.strokeStyle='rgba(255,226,165,.38)';ctx.stroke();
    return c;
  }
  function svg(tag,attrs){var n=document.createElementNS('http://www.w3.org/2000/svg',tag);for(var k in attrs)n.setAttribute(k,attrs[k]);return n;}
  function asleep(){var stage=document.getElementById('stage');var gallery=document.documentElement.getAttribute('data-clock-gallery');return !HV.canWork()||gallery&&gallery!=='closed'||document.documentElement.classList.contains('num-editing')||stage&&stage.getAttribute('aria-hidden')==='true';}
  function mount(root){
    makeAtlas();root.classList.add('f-sand');root.setAttribute('aria-label','砂金时钟');root.setAttribute('data-sand-mode','live');
    var bg=document.createElement('img');bg.className='sand-bg bg';bg.src='/frame/hv/standby/assets/sand-surface.svg';bg.alt='';root.appendChild(bg);
    var numbers=document.createElement('div');numbers.className='sand-numbers';var mask=document.createElement('div');mask.className='sand-rotation-mask';mask.style.webkitMaskImage='url('+wipeURL+')';var glyphs=document.createElement('img');glyphs.className='sand-glyphs';glyphs.src=atlasURL;glyphs.alt='';mask.appendChild(glyphs);numbers.appendChild(mask);root.appendChild(numbers);var movement=document.createElement('div');movement.className='sand-movement';root.appendChild(movement);
    var minute=handSprite('minute'),hour=handSprite('hour');minute.className='sand-minute';hour.className='sand-hour';movement.appendChild(hour);movement.appendChild(minute);
    /* One narrow texture replaces 112 animated SVG nodes. Only this 32x414 canvas repaints at 12Hz. */
    var second=document.createElement('div'),needle=canvas(32,414),particles=canvas(32,208),grains=[];second.className='sand-second';needle.className='sand-needle';particles.className='sand-grains';second.appendChild(particles);second.appendChild(needle);
    var ctx=needle.getContext('2d');ctx.lineCap='round';ctx.strokeStyle='#bd8d40';ctx.lineWidth=3.5;ctx.beginPath();ctx.moveTo(16,407);ctx.lineTo(16,6);ctx.stroke();ctx.globalAlpha=.75;ctx.strokeStyle='#ebca82';ctx.lineWidth=.8;ctx.beginPath();ctx.moveTo(15.1,406);ctx.lineTo(15.1,6);ctx.stroke();
    for(var i=0;i<112;i++)grains.push({rx:.75+noise(i,2)*1.3,ry:.6+noise(i,3)*.9});
    movement.insertBefore(second,hour);
    var hub=svg('svg',{'class':'sand-mechanics sand-hub',viewBox:'0 0 768 768','aria-hidden':'true'});
    hub.appendChild(svg('circle',{cx:C,cy:C,r:9.5,fill:'#a17b3f',stroke:'#f8e6b3','stroke-width':2}));hub.appendChild(svg('circle',{cx:C,cy:C,r:4.8,fill:'#d8bd85',stroke:'#805d2a','stroke-width':1.1}));movement.appendChild(hub);
    var state={root:root,mask:mask,glyphs:glyphs,hour:hour,minute:minute,second:second,particles:particles,grains:grains,lastGrain:-1,lastSecond:-1,draws:0,starts:0,animations:[],baseSeconds:0,baseMono:0};root._sandState=state;
    root.tick=function(){if(activeState()!==state||asleep())return;if(reduce){var t=wallSeconds();pose(state,t);paintGrains(state,t,true);}else sync();};root.fast=true;
    var t=wallSeconds();pose(state,t);paintGrains(state,t,true);return root;
  }
  function wallSeconds(){
    /* Both whole seconds and milliseconds come from one corrected instant. */
    var now=HV.now(),t=HV.local(now);return t.h*3600+t.mi*60+t.s+now.getMilliseconds()/1000;
  }
  function elapsed(s){return s.baseSeconds+(performance.now()-s.baseMono)/1000;}
  function pose(s,t){
    var angle=(t%60)*6;s.mask.style.transform='rotate('+angle+'deg)';s.glyphs.style.transform='rotate('+(-angle)+'deg)';
    s.hour.style.transform='rotate('+((t/3600%12)*30)+'deg)';s.minute.style.transform='rotate('+((t/60%60)*6)+'deg)';s.second.style.transform='rotate('+angle+'deg)';
  }
  function paintGrains(s,t,force){
    var sec=t%60,pulse=reduce?0:Math.floor(t*12);if(!force&&pulse===s.lastGrain)return;s.lastGrain=pulse;
    var ctx=s.particles.getContext('2d');ctx.clearRect(0,0,32,208);
    for(var i=0;i<s.grains.length;i++){
      var g=s.grains[i],distance=162+(i/111)*185,r=2+noise(i,pulse)*6.5,spread=Math.sin((i+sec*7)*1.7)*1.6,x=16+r,y=356-distance+spread,alpha=.35+noise(i+123,pulse)*.53;
      ctx.globalAlpha=alpha*.3;ctx.fillStyle='#9a783f';ctx.beginPath();ctx.ellipse(x+.7,y+.9,g.rx*1.1,g.ry,0,0,Math.PI*2);ctx.fill();
      ctx.globalAlpha=alpha;ctx.fillStyle=i%3?'#f8edcf':'#fff9e6';ctx.beginPath();ctx.ellipse(x,y,g.rx,g.ry,0,0,Math.PI*2);ctx.fill();
    }
    ctx.globalAlpha=1;s.draws++;s.root.setAttribute('data-sand-second',sec.toFixed(3));
  }
  function activeState(){var current=window.HVClockFaces&&HVClockFaces.current();return current&&current.element&&current.element.classList.contains('on')?current.element._sandState:null;}
  function stop(){
    clearTimeout(timer);timer=0;if(raf)cancelAnimationFrame(raf);raf=0;
    if(!owner)return;var s=owner;if(s.baseMono)pose(s,elapsed(s));
    for(var i=0;i<s.animations.length;i++)s.animations[i].cancel();s.animations=[];owner=null;
  }
  function rotate(s,node,from,turn,duration){
    var a=node.animate([{transform:'rotate('+from+'deg)'},{transform:'rotate('+(from+turn)+'deg)'}],{duration:duration,iterations:Infinity,easing:'linear',fill:'both'});
    /* All five tracks use the same document-monotonic start; grains cannot retime the hand. */
    a.startTime=s.baseMono;s.animations.push(a);
  }
  function start(s){
    s.baseSeconds=wallSeconds();s.baseMono=performance.now();s.starts++;pose(s,s.baseSeconds);paintGrains(s,s.baseSeconds,true);
    if(reduce)return;
    try{
      var a=(s.baseSeconds%60)*6;rotate(s,s.second,a,360,60000);rotate(s,s.mask,a,360,60000);rotate(s,s.glyphs,-a,-360,60000);
      rotate(s,s.minute,(s.baseSeconds/60%60)*6,360,3600000);rotate(s,s.hour,(s.baseSeconds/3600%12)*30,360,43200000);
    }catch(ignore){for(var i=0;i<s.animations.length;i++)s.animations[i].cancel();s.animations=[];}
  }
  function grainTick(){timer=0;if(asleep()||activeState()!==owner){sync();return;}paintGrains(owner,elapsed(owner),false);timer=setTimeout(grainTick,GRAIN_MS);}
  function fallback(now){raf=0;if(asleep()||activeState()!==owner){sync();return;}if(now-last>=FRAME){last=now;var t=elapsed(owner);pose(owner,t);paintGrains(owner,t,false);}raf=requestAnimationFrame(fallback);}
  function sync(){
    var s=activeState();if(!s||asleep()){stop();return;}if(owner!==s){stop();owner=s;start(s);}
    if(reduce)return;if(s.animations.length){if(!timer)timer=setTimeout(grainTick,GRAIN_MS);}else if(!raf)raf=requestAnimationFrame(fallback);
  }
  document.addEventListener('visibilitychange',sync);document.addEventListener('hv-work-change',sync);
  window.HVSand={mount:mount,sync:sync,stats:function(){var s=activeState();return {active:!!s,running:!!owner&&!asleep(),draws:s?s.draws:0,animationStarts:s?s.starts:0,animations:s?s.animations.length:0,motion:s&&s.animations.length?'compositor':reduce?'reduced':'fallback',grainHz:reduce?0:12};}};
})();
